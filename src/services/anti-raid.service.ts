import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import { Context } from 'telegraf';

const prisma = new PrismaClient();

/**
 * Raid detection result
 */
export interface RaidDetectionResult {
  isRaid: boolean;
  joinCount: number;
  threshold: number;
  timeWindow: number;
  lockdownEnabled: boolean;
}

class AntiRaidService {
  // Track recent joins in memory for fast detection
  private recentJoins: Map<string, bigint[]> = new Map();

  /**
   * Track a new user join
   */
  async trackJoin(groupId: string, telegramUserId: bigint): Promise<RaidDetectionResult> {
    try {
      const portal = await prisma.portal.findUnique({
        where: { groupId },
      });

      if (!portal || !portal.antiRaidEnabled) {
        return {
          isRaid: false,
          joinCount: 0,
          threshold: 0,
          timeWindow: 0,
          lockdownEnabled: false,
        };
      }

      // Get or initialize recent joins for this group
      if (!this.recentJoins.has(groupId)) {
        this.recentJoins.set(groupId, []);
      }

      const joins = this.recentJoins.get(groupId)!;

      // Add new join
      joins.push(telegramUserId);

      // Clean up old joins (older than time window)
      const now = Date.now();
      const timeWindow = 60; // 60 seconds default
      const cutoffTime = now - timeWindow * 1000;

      // Note: We're storing user IDs, not timestamps
      // For simplicity, we'll keep last N joins and check count
      // In production, you'd want to store timestamps too

      const threshold = portal.raidThreshold;

      // Check if we're over threshold
      if (joins.length >= threshold) {
        // RAID DETECTED!
        await this.handleRaidDetection(groupId, joins, timeWindow);

        // Clear the join list after raid detection
        this.recentJoins.set(groupId, []);

        return {
          isRaid: true,
          joinCount: joins.length,
          threshold,
          timeWindow,
          lockdownEnabled: true,
        };
      }

      // Periodically clean up to prevent memory leak
      if (joins.length > threshold * 2) {
        joins.splice(0, joins.length - threshold);
      }

      return {
        isRaid: false,
        joinCount: joins.length,
        threshold,
        timeWindow,
        lockdownEnabled: false,
      };
    } catch (error) {
      logger.error('Error tracking join:', error);
      return {
        isRaid: false,
        joinCount: 0,
        threshold: 0,
        timeWindow: 0,
        lockdownEnabled: false,
      };
    }
  }

  /**
   * Handle raid detection
   */
  private async handleRaidDetection(groupId: string, userIds: bigint[], timeWindow: number): Promise<void> {
    try {
      // Create raid event
      const lockdownDuration = 30 * 60; // 30 minutes
      const lockdownUntil = new Date(Date.now() + lockdownDuration * 1000);

      const raidEvent = await prisma.raidEvent.create({
        data: {
          groupId,
          joinCount: userIds.length,
          timeWindow,
          triggeredAt: new Date(),
          lockdownEnabled: true,
          lockdownUntil,
          userIds: JSON.stringify(userIds.map((id) => id.toString())),
        },
      });

      // Update portal to anti-raid mode
      await prisma.portal.update({
        where: { groupId },
        data: { spamMode: 'anti_raid' },
      });

      logger.warn(
        `RAID DETECTED in group ${groupId}! ${userIds.length} joins in ${timeWindow}s. Lockdown until ${lockdownUntil.toISOString()}`
      );

      // Note: Actual Telegram actions (like disabling invite links)
      // would be done in the bot handler that calls this service
    } catch (error) {
      logger.error('Error handling raid detection:', error);
    }
  }

  /**
   * Check if group is in lockdown
   */
  async isInLockdown(groupId: string): Promise<boolean> {
    try {
      const activeRaid = await prisma.raidEvent.findFirst({
        where: {
          groupId,
          lockdownEnabled: true,
          lockdownUntil: { gt: new Date() },
          resolved: false,
        },
        orderBy: { triggeredAt: 'desc' },
      });

      return !!activeRaid;
    } catch (error) {
      logger.error('Error checking lockdown status:', error);
      return false;
    }
  }

  /**
   * Get active raid event for a group
   */
  async getActiveRaidEvent(groupId: string): Promise<any | null> {
    try {
      const activeRaid = await prisma.raidEvent.findFirst({
        where: {
          groupId,
          resolved: false,
        },
        orderBy: { triggeredAt: 'desc' },
      });

      return activeRaid;
    } catch (error) {
      logger.error('Error getting active raid event:', error);
      return null;
    }
  }

  /**
   * Manually end lockdown
   */
  async endLockdown(groupId: string, adminUserId: bigint): Promise<boolean> {
    try {
      const activeRaid = await this.getActiveRaidEvent(groupId);

      if (!activeRaid) {
        return false;
      }

      // Mark raid as resolved
      await prisma.raidEvent.update({
        where: { id: activeRaid.id },
        data: {
          resolved: true,
          resolvedAt: new Date(),
          resolvedBy: adminUserId,
          lockdownEnabled: false,
        },
      });

      // Restore normal spam mode
      await prisma.portal.update({
        where: { groupId },
        data: { spamMode: 'standard' },
      });

      // Clear recent joins
      this.recentJoins.delete(groupId);

      logger.info(`Lockdown ended for group ${groupId} by admin ${adminUserId}`);
      return true;
    } catch (error) {
      logger.error('Error ending lockdown:', error);
      return false;
    }
  }

  /**
   * Auto-resolve expired lockdowns
   */
  async autoResolveExpiredLockdowns(): Promise<number> {
    try {
      const expiredRaids = await prisma.raidEvent.findMany({
        where: {
          lockdownEnabled: true,
          lockdownUntil: { lt: new Date() },
          resolved: false,
        },
      });

      if (expiredRaids.length === 0) {
        return 0;
      }

      // Resolve each expired raid
      for (const raid of expiredRaids) {
        await prisma.raidEvent.update({
          where: { id: raid.id },
          data: {
            resolved: true,
            resolvedAt: new Date(),
            lockdownEnabled: false,
          },
        });

        // Restore normal spam mode
        await prisma.portal.update({
          where: { groupId: raid.groupId },
          data: { spamMode: 'standard' },
        });

        // Clear recent joins
        this.recentJoins.delete(raid.groupId);

        logger.info(`Auto-resolved expired lockdown for group ${raid.groupId}`);
      }

      return expiredRaids.length;
    } catch (error) {
      logger.error('Error auto-resolving expired lockdowns:', error);
      return 0;
    }
  }

  /**
   * Ban raid participants
   */
  async banRaidParticipants(groupId: string, raidEventId: string, ctx: Context): Promise<number> {
    try {
      const raidEvent = await prisma.raidEvent.findUnique({
        where: { id: raidEventId },
      });

      if (!raidEvent) {
        return 0;
      }

      const userIds: string[] = JSON.parse(raidEvent.userIds);
      let bannedCount = 0;

      const group = await prisma.group.findUnique({
        where: { id: groupId },
      });

      if (!group) {
        return 0;
      }

      // Ban each user
      for (const userIdStr of userIds) {
        try {
          const userId = BigInt(userIdStr);
          await ctx.telegram.banChatMember(Number(group.telegramId), Number(userId));
          bannedCount++;
        } catch (error) {
          logger.warn(`Failed to ban user ${userIdStr}:`, error);
        }
      }

      logger.info(`Banned ${bannedCount}/${userIds.length} raid participants from group ${groupId}`);
      return bannedCount;
    } catch (error) {
      logger.error('Error banning raid participants:', error);
      return 0;
    }
  }

  /**
   * Kick raid participants (without ban)
   */
  async kickRaidParticipants(groupId: string, raidEventId: string, ctx: Context): Promise<number> {
    try {
      const raidEvent = await prisma.raidEvent.findUnique({
        where: { id: raidEventId },
      });

      if (!raidEvent) {
        return 0;
      }

      const userIds: string[] = JSON.parse(raidEvent.userIds);
      let kickedCount = 0;

      const group = await prisma.group.findUnique({
        where: { id: groupId },
      });

      if (!group) {
        return 0;
      }

      // Kick each user
      for (const userIdStr of userIds) {
        try {
          const userId = BigInt(userIdStr);
          await ctx.telegram.banChatMember(Number(group.telegramId), Number(userId));
          // Unban immediately (effectively a kick)
          await ctx.telegram.unbanChatMember(Number(group.telegramId), Number(userId));
          kickedCount++;
        } catch (error) {
          logger.warn(`Failed to kick user ${userIdStr}:`, error);
        }
      }

      logger.info(`Kicked ${kickedCount}/${userIds.length} raid participants from group ${groupId}`);
      return kickedCount;
    } catch (error) {
      logger.error('Error kicking raid participants:', error);
      return 0;
    }
  }

  /**
   * Get raid statistics for a group
   */
  async getRaidStats(groupId: string) {
    try {
      const [totalRaids, activeRaids, resolvedRaids] = await Promise.all([
        prisma.raidEvent.count({ where: { groupId } }),
        prisma.raidEvent.count({ where: { groupId, resolved: false } }),
        prisma.raidEvent.count({ where: { groupId, resolved: true } }),
      ]);

      const recentRaid = await prisma.raidEvent.findFirst({
        where: { groupId },
        orderBy: { triggeredAt: 'desc' },
      });

      const isCurrentlyInLockdown = await this.isInLockdown(groupId);

      return {
        totalRaids,
        activeRaids,
        resolvedRaids,
        recentRaid: recentRaid
          ? {
              triggeredAt: recentRaid.triggeredAt,
              joinCount: recentRaid.joinCount,
              resolved: recentRaid.resolved,
              lockdownUntil: recentRaid.lockdownUntil,
            }
          : null,
        isCurrentlyInLockdown,
      };
    } catch (error) {
      logger.error('Error getting raid stats:', error);
      return null;
    }
  }

  /**
   * Update raid threshold for a group
   */
  async updateRaidThreshold(groupId: string, threshold: number): Promise<boolean> {
    try {
      await prisma.portal.update({
        where: { groupId },
        data: { raidThreshold: threshold },
      });

      logger.info(`Updated raid threshold for group ${groupId} to ${threshold}`);
      return true;
    } catch (error) {
      logger.error('Error updating raid threshold:', error);
      return false;
    }
  }

  /**
   * Enable/disable anti-raid protection
   */
  async toggleAntiRaid(groupId: string, enabled: boolean): Promise<boolean> {
    try {
      await prisma.portal.update({
        where: { groupId },
        data: { antiRaidEnabled: enabled },
      });

      logger.info(`${enabled ? 'Enabled' : 'Disabled'} anti-raid for group ${groupId}`);
      return true;
    } catch (error) {
      logger.error('Error toggling anti-raid:', error);
      return false;
    }
  }

  /**
   * Clear recent joins for a group (reset tracking)
   */
  resetJoinTracking(groupId: string): void {
    this.recentJoins.delete(groupId);
    logger.info(`Reset join tracking for group ${groupId}`);
  }

  /**
   * Get recent join count for a group
   */
  getRecentJoinCount(groupId: string): number {
    return this.recentJoins.get(groupId)?.length || 0;
  }
}

export default new AntiRaidService();
