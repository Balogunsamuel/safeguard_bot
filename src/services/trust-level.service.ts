import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Trust levels in the system
 */
export enum TrustLevel {
  NEW = 1,
  TRUSTED = 2,
  VIP = 3,
}

/**
 * Trust level information
 */
export interface TrustLevelInfo {
  level: number;
  levelName: string;
  emoji: string;
  description: string;
  joinedAt: Date;
  messageCount: number;
  warningCount: number;
  canBePromoted: boolean;
  nextPromotionAt?: Date;
}

class TrustLevelService {
  private readonly LEVEL_NAMES = {
    1: 'New Member',
    2: 'Trusted Member',
    3: 'VIP Member',
  };

  private readonly LEVEL_EMOJIS = {
    1: '🆕',
    2: '✅',
    3: '⭐',
  };

  /**
   * Initialize trust level for a new user
   */
  async initializeTrustLevel(userId: string, groupId: string): Promise<void> {
    try {
      // Check if already exists
      const existing = await prisma.trustLevel.findUnique({
        where: {
          userId_groupId: { userId, groupId },
        },
      });

      if (existing) {
        return; // Already initialized
      }

      // Create new trust level
      await prisma.trustLevel.create({
        data: {
          userId,
          groupId,
          level: TrustLevel.NEW,
          joinedAt: new Date(),
        },
      });

      logger.info(`Initialized trust level for user ${userId} in group ${groupId}`);
    } catch (error) {
      logger.error('Error initializing trust level:', error);
      throw error;
    }
  }

  /**
   * Get user's trust level in a group
   */
  async getTrustLevel(userId: string, groupId: string): Promise<TrustLevelInfo | null> {
    try {
      const trustLevel = await prisma.trustLevel.findUnique({
        where: {
          userId_groupId: { userId, groupId },
        },
      });

      if (!trustLevel) {
        return null;
      }

      // Get portal config for promotion rules
      const portal = await prisma.portal.findUnique({
        where: { groupId },
      });

      if (!portal || !portal.enableTrustLevels) {
        return this.mapToTrustLevelInfo(trustLevel, false);
      }

      // Check if user can be promoted
      const canBePromoted = await this.canBePromoted(trustLevel, portal);
      const nextPromotionAt = this.calculateNextPromotionTime(trustLevel, portal);

      return this.mapToTrustLevelInfo(trustLevel, canBePromoted, nextPromotionAt);
    } catch (error) {
      logger.error('Error getting trust level:', error);
      return null;
    }
  }

  /**
   * Map database model to TrustLevelInfo
   */
  private mapToTrustLevelInfo(
    trustLevel: any,
    canBePromoted: boolean,
    nextPromotionAt?: Date
  ): TrustLevelInfo {
    return {
      level: trustLevel.level,
      levelName: this.LEVEL_NAMES[trustLevel.level as keyof typeof this.LEVEL_NAMES],
      emoji: this.LEVEL_EMOJIS[trustLevel.level as keyof typeof this.LEVEL_EMOJIS],
      description: this.getLevelDescription(trustLevel.level),
      joinedAt: trustLevel.joinedAt,
      messageCount: trustLevel.messageCount,
      warningCount: trustLevel.warningCount,
      canBePromoted,
      nextPromotionAt,
    };
  }

  /**
   * Get description for a trust level
   */
  private getLevelDescription(level: number): string {
    switch (level) {
      case TrustLevel.NEW:
        return 'New to the group. Restricted posting abilities.';
      case TrustLevel.TRUSTED:
        return 'Trusted member with full posting rights.';
      case TrustLevel.VIP:
        return 'VIP member with additional privileges.';
      default:
        return 'Unknown level';
    }
  }

  /**
   * Increment message count for a user
   */
  async incrementMessageCount(userId: string, groupId: string): Promise<void> {
    try {
      await prisma.trustLevel.update({
        where: {
          userId_groupId: { userId, groupId },
        },
        data: {
          messageCount: { increment: 1 },
          lastMessageAt: new Date(),
        },
      });

      // Check for auto-promotion
      await this.checkAndPromote(userId, groupId);
    } catch (error) {
      logger.error('Error incrementing message count:', error);
    }
  }

  /**
   * Add a warning to a user
   */
  async addWarning(userId: string, groupId: string, reason?: string): Promise<void> {
    try {
      const updated = await prisma.trustLevel.update({
        where: {
          userId_groupId: { userId, groupId },
        },
        data: {
          warningCount: { increment: 1 },
          violationCount: { increment: 1 },
          lastViolationAt: new Date(),
        },
      });

      logger.warn(
        `Added warning to user ${userId} in group ${groupId}. Total warnings: ${updated.warningCount}. Reason: ${reason || 'N/A'}`
      );

      // Check if user should be demoted
      if (updated.warningCount >= 3 && updated.level > TrustLevel.NEW) {
        await this.demoteUser(userId, groupId, 'Too many warnings');
      }
    } catch (error) {
      logger.error('Error adding warning:', error);
    }
  }

  /**
   * Mute a user
   */
  async muteUser(userId: string, groupId: string, durationSeconds: number): Promise<void> {
    try {
      const mutedUntil = new Date(Date.now() + durationSeconds * 1000);

      await prisma.trustLevel.update({
        where: {
          userId_groupId: { userId, groupId },
        },
        data: {
          isMuted: true,
          mutedUntil,
        },
      });

      logger.info(`Muted user ${userId} in group ${groupId} until ${mutedUntil.toISOString()}`);
    } catch (error) {
      logger.error('Error muting user:', error);
    }
  }

  /**
   * Unmute a user
   */
  async unmuteUser(userId: string, groupId: string): Promise<void> {
    try {
      await prisma.trustLevel.update({
        where: {
          userId_groupId: { userId, groupId },
        },
        data: {
          isMuted: false,
          mutedUntil: null,
        },
      });

      logger.info(`Unmuted user ${userId} in group ${groupId}`);
    } catch (error) {
      logger.error('Error unmuting user:', error);
    }
  }

  /**
   * Check if user is currently muted
   */
  async isMuted(userId: string, groupId: string): Promise<boolean> {
    try {
      const trustLevel = await prisma.trustLevel.findUnique({
        where: {
          userId_groupId: { userId, groupId },
        },
      });

      if (!trustLevel || !trustLevel.isMuted) {
        return false;
      }

      // Check if mute has expired
      if (trustLevel.mutedUntil && new Date() > trustLevel.mutedUntil) {
        await this.unmuteUser(userId, groupId);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error checking mute status:', error);
      return false;
    }
  }

  /**
   * Check if user can be promoted and promote if eligible
   */
  private async checkAndPromote(userId: string, groupId: string): Promise<void> {
    try {
      const trustLevel = await prisma.trustLevel.findUnique({
        where: {
          userId_groupId: { userId, groupId },
        },
      });

      if (!trustLevel) return;

      const portal = await prisma.portal.findUnique({
        where: { groupId },
      });

      if (!portal || !portal.enableTrustLevels) return;

      const canPromote = await this.canBePromoted(trustLevel, portal);

      if (canPromote) {
        await this.promoteUser(userId, groupId);
      }
    } catch (error) {
      logger.error('Error checking for promotion:', error);
    }
  }

  /**
   * Check if user is eligible for promotion
   */
  private async canBePromoted(trustLevel: any, portal: any): Promise<boolean> {
    // Can't promote VIP users further
    if (trustLevel.level >= TrustLevel.VIP) {
      return false;
    }

    // Check for warnings
    if (trustLevel.warningCount >= 2) {
      return false;
    }

    const now = new Date();
    const joinDuration = (now.getTime() - trustLevel.joinedAt.getTime()) / 1000; // seconds

    // Promotion to Trusted (Level 2)
    if (trustLevel.level === TrustLevel.NEW) {
      const requiredTime = portal.level1Duration;
      const requiredMessages = 10;

      return joinDuration >= requiredTime && trustLevel.messageCount >= requiredMessages;
    }

    // Promotion to VIP (Level 3)
    if (trustLevel.level === TrustLevel.TRUSTED) {
      const requiredTime = portal.level2Duration;
      const requiredMessages = 50;

      return joinDuration >= requiredTime && trustLevel.messageCount >= requiredMessages;
    }

    return false;
  }

  /**
   * Calculate when user can be promoted next
   */
  private calculateNextPromotionTime(trustLevel: any, portal: any): Date | undefined {
    if (trustLevel.level >= TrustLevel.VIP) {
      return undefined;
    }

    const requiredDuration =
      trustLevel.level === TrustLevel.NEW ? portal.level1Duration : portal.level2Duration;

    const promotionTime = new Date(trustLevel.joinedAt.getTime() + requiredDuration * 1000);

    return promotionTime > new Date() ? promotionTime : undefined;
  }

  /**
   * Manually promote a user
   */
  async promoteUser(userId: string, groupId: string, manual: boolean = false): Promise<boolean> {
    try {
      const trustLevel = await prisma.trustLevel.findUnique({
        where: {
          userId_groupId: { userId, groupId },
        },
      });

      if (!trustLevel) {
        logger.error(`Trust level not found for user ${userId} in group ${groupId}`);
        return false;
      }

      if (trustLevel.level >= TrustLevel.VIP) {
        logger.info(`User ${userId} is already at max level`);
        return false;
      }

      const newLevel = trustLevel.level + 1;

      await prisma.trustLevel.update({
        where: {
          userId_groupId: { userId, groupId },
        },
        data: {
          level: newLevel,
          lastPromotionAt: new Date(),
          warningCount: 0, // Reset warnings on promotion
        },
      });

      logger.info(
        `${manual ? 'Manually promoted' : 'Auto-promoted'} user ${userId} in group ${groupId} to level ${newLevel}`
      );

      return true;
    } catch (error) {
      logger.error('Error promoting user:', error);
      return false;
    }
  }

  /**
   * Manually demote a user
   */
  async demoteUser(userId: string, groupId: string, reason?: string): Promise<boolean> {
    try {
      const trustLevel = await prisma.trustLevel.findUnique({
        where: {
          userId_groupId: { userId, groupId },
        },
      });

      if (!trustLevel) {
        logger.error(`Trust level not found for user ${userId} in group ${groupId}`);
        return false;
      }

      if (trustLevel.level <= TrustLevel.NEW) {
        logger.info(`User ${userId} is already at minimum level`);
        return false;
      }

      const newLevel = trustLevel.level - 1;

      await prisma.trustLevel.update({
        where: {
          userId_groupId: { userId, groupId },
        },
        data: {
          level: newLevel,
        },
      });

      logger.warn(`Demoted user ${userId} in group ${groupId} to level ${newLevel}. Reason: ${reason || 'N/A'}`);

      return true;
    } catch (error) {
      logger.error('Error demoting user:', error);
      return false;
    }
  }

  /**
   * Reset user's warnings
   */
  async resetWarnings(userId: string, groupId: string): Promise<void> {
    try {
      await prisma.trustLevel.update({
        where: {
          userId_groupId: { userId, groupId },
        },
        data: {
          warningCount: 0,
          violationCount: 0,
          lastViolationAt: null,
        },
      });

      logger.info(`Reset warnings for user ${userId} in group ${groupId}`);
    } catch (error) {
      logger.error('Error resetting warnings:', error);
    }
  }

  /**
   * Get all users at a specific trust level
   */
  async getUsersByLevel(groupId: string, level: TrustLevel): Promise<any[]> {
    try {
      return await prisma.trustLevel.findMany({
        where: {
          groupId,
          level,
        },
        orderBy: {
          joinedAt: 'asc',
        },
      });
    } catch (error) {
      logger.error('Error getting users by level:', error);
      return [];
    }
  }

  /**
   * Get trust level statistics for a group
   */
  async getGroupStats(groupId: string) {
    try {
      const [level1, level2, level3, muted, warned] = await Promise.all([
        prisma.trustLevel.count({ where: { groupId, level: TrustLevel.NEW } }),
        prisma.trustLevel.count({ where: { groupId, level: TrustLevel.TRUSTED } }),
        prisma.trustLevel.count({ where: { groupId, level: TrustLevel.VIP } }),
        prisma.trustLevel.count({ where: { groupId, isMuted: true } }),
        prisma.trustLevel.count({ where: { groupId, warningCount: { gt: 0 } } }),
      ]);

      const total = level1 + level2 + level3;

      return {
        total,
        byLevel: {
          new: level1,
          trusted: level2,
          vip: level3,
        },
        muted,
        warned,
      };
    } catch (error) {
      logger.error('Error getting group stats:', error);
      return null;
    }
  }
}

export default new TrustLevelService();
