import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import { TrustLevel } from './trust-level.service';
import trustLevelService from './trust-level.service';

const prisma = new PrismaClient();

/**
 * Spam mode levels
 */
export enum SpamMode {
  OFF = 'off',
  STANDARD = 'standard',
  STRICT = 'strict',
  ANTI_RAID = 'anti_raid',
}

/**
 * Spam check result
 */
export interface SpamCheckResult {
  isSpam: boolean;
  reason?: string;
  action: 'allow' | 'delete' | 'warn' | 'mute';
  shouldNotify: boolean;
}

class SpamControlService {
  /**
   * Initialize spam config for a group with defaults
   */
  async initializeSpamConfig(groupId: string): Promise<void> {
    try {
      const existing = await prisma.spamConfig.findUnique({
        where: { groupId },
      });

      if (existing) {
        return; // Already initialized
      }

      await prisma.spamConfig.create({
        data: { groupId },
      });

      logger.info(`Initialized spam config for group ${groupId}`);
    } catch (error) {
      logger.error('Error initializing spam config:', error);
      throw error;
    }
  }

  /**
   * Get spam configuration for a group
   */
  async getSpamConfig(groupId: string): Promise<any | null> {
    try {
      let config = await prisma.spamConfig.findUnique({
        where: { groupId },
      });

      if (!config) {
        await this.initializeSpamConfig(groupId);
        config = await prisma.spamConfig.findUnique({
          where: { groupId },
        });
      }

      return config;
    } catch (error) {
      logger.error('Error getting spam config:', error);
      return null;
    }
  }

  /**
   * Update spam configuration
   */
  async updateSpamConfig(groupId: string, updates: Partial<any>): Promise<boolean> {
    try {
      await prisma.spamConfig.upsert({
        where: { groupId },
        create: { groupId, ...updates },
        update: updates,
      });

      logger.info(`Updated spam config for group ${groupId}`);
      return true;
    } catch (error) {
      logger.error('Error updating spam config:', error);
      return false;
    }
  }

  /**
   * Check if a message should be flagged as spam
   */
  async checkMessage(
    groupId: string,
    userId: string,
    telegramUserId: bigint,
    messageText: string,
    userTrustLevel: number
  ): Promise<SpamCheckResult> {
    try {
      const config = await this.getSpamConfig(groupId);
      const portal = await prisma.portal.findUnique({ where: { groupId } });

      if (!config) {
        return { isSpam: false, action: 'allow', shouldNotify: false };
      }

      // Get current spam mode
      const spamMode = portal?.spamMode || SpamMode.STANDARD;

      if (spamMode === SpamMode.OFF) {
        return { isSpam: false, action: 'allow', shouldNotify: false };
      }

      // Check rate limiting
      const rateLimitResult = await this.checkRateLimit(groupId, telegramUserId, config);
      if (rateLimitResult.isSpam) {
        return rateLimitResult;
      }

      // Level 1 users: stricter rules
      if (userTrustLevel === TrustLevel.NEW) {
        // Block all Level 1 messages if configured
        if (config.blockLevel1Messages) {
          return {
            isSpam: true,
            reason: 'New members cannot post yet',
            action: 'delete',
            shouldNotify: true,
          };
        }

        // URL filtering
        if (config.blockUrls && this.containsURL(messageText)) {
          return {
            isSpam: true,
            reason: 'URLs not allowed for new members',
            action: 'delete',
            shouldNotify: true,
          };
        }

        // Telegram links
        if (config.blockTelegramLinks && this.containsTelegramLink(messageText)) {
          return {
            isSpam: true,
            reason: 'Telegram links not allowed for new members',
            action: 'delete',
            shouldNotify: true,
          };
        }

        // Contract addresses
        if (config.blockContractAddresses && this.containsContractAddress(messageText)) {
          return {
            isSpam: true,
            reason: 'Contract addresses not allowed for new members',
            action: 'delete',
            shouldNotify: true,
          };
        }
      }

      // Strict mode: additional checks
      if (spamMode === SpamMode.STRICT || spamMode === SpamMode.ANTI_RAID) {
        // Check for repeated characters (spammy)
        if (this.hasRepeatedCharacters(messageText)) {
          return {
            isSpam: true,
            reason: 'Excessive repeated characters',
            action: userTrustLevel === TrustLevel.NEW ? 'delete' : 'warn',
            shouldNotify: true,
          };
        }

        // Check for excessive caps
        if (this.hasExcessiveCaps(messageText)) {
          return {
            isSpam: true,
            reason: 'Excessive capital letters',
            action: userTrustLevel === TrustLevel.NEW ? 'delete' : 'warn',
            shouldNotify: true,
          };
        }

        // Check for mass mentions
        if (this.hasMassMentions(messageText)) {
          return {
            isSpam: true,
            reason: 'Mass mentions detected',
            action: 'delete',
            shouldNotify: true,
          };
        }
      }

      return { isSpam: false, action: 'allow', shouldNotify: false };
    } catch (error) {
      logger.error('Error checking message for spam:', error);
      return { isSpam: false, action: 'allow', shouldNotify: false };
    }
  }

  /**
   * Check rate limiting for a user
   */
  private async checkRateLimit(
    groupId: string,
    telegramUserId: bigint,
    config: any
  ): Promise<SpamCheckResult> {
    try {
      const now = new Date();

      // Get or create message activity
      let activity = await prisma.messageActivity.findUnique({
        where: {
          groupId_telegramUserId: {
            groupId,
            telegramUserId,
          },
        },
      });

      if (!activity) {
        // Create new activity
        activity = await prisma.messageActivity.create({
          data: {
            groupId,
            telegramUserId,
            messagesLastMinute: 1,
            messagesLastHour: 1,
            minuteResetAt: new Date(now.getTime() + 60000),
            hourResetAt: new Date(now.getTime() + 3600000),
          },
        });
        return { isSpam: false, action: 'allow', shouldNotify: false };
      }

      // Reset counters if needed
      if (now > activity.minuteResetAt) {
        activity.messagesLastMinute = 0;
        activity.minuteResetAt = new Date(now.getTime() + 60000);
      }

      if (now > activity.hourResetAt) {
        activity.messagesLastHour = 0;
        activity.hourResetAt = new Date(now.getTime() + 3600000);
      }

      // Increment counters
      activity.messagesLastMinute++;
      activity.messagesLastHour++;

      // Check limits
      if (activity.messagesLastMinute > config.maxMessagesPerMinute) {
        // Update violation count
        await prisma.messageActivity.update({
          where: { id: activity.id },
          data: {
            violationCount: { increment: 1 },
            lastViolationAt: now,
          },
        });

        return {
          isSpam: true,
          reason: `Rate limit exceeded: ${config.maxMessagesPerMinute} messages per minute`,
          action: 'mute',
          shouldNotify: true,
        };
      }

      if (activity.messagesLastHour > config.maxMessagesPerHour) {
        await prisma.messageActivity.update({
          where: { id: activity.id },
          data: {
            violationCount: { increment: 1 },
            lastViolationAt: now,
          },
        });

        return {
          isSpam: true,
          reason: `Rate limit exceeded: ${config.maxMessagesPerHour} messages per hour`,
          action: 'mute',
          shouldNotify: true,
        };
      }

      // Update activity
      await prisma.messageActivity.update({
        where: { id: activity.id },
        data: {
          messagesLastMinute: activity.messagesLastMinute,
          messagesLastHour: activity.messagesLastHour,
          lastMessageAt: now,
          minuteResetAt: activity.minuteResetAt,
          hourResetAt: activity.hourResetAt,
        },
      });

      return { isSpam: false, action: 'allow', shouldNotify: false };
    } catch (error) {
      logger.error('Error checking rate limit:', error);
      return { isSpam: false, action: 'allow', shouldNotify: false };
    }
  }

  /**
   * Check if text contains URLs
   */
  private containsURL(text: string): boolean {
    const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|net|org|io|xyz|me|co)[^\s]*)/gi;
    return urlRegex.test(text);
  }

  /**
   * Check if text contains Telegram links
   */
  private containsTelegramLink(text: string): boolean {
    const telegramRegex = /(t\.me\/|telegram\.me\/|@[a-zA-Z0-9_]{5,})/gi;
    return telegramRegex.test(text);
  }

  /**
   * Check if text contains contract addresses
   */
  private containsContractAddress(text: string): boolean {
    // Ethereum-style addresses (0x + 40 hex chars)
    const ethRegex = /0x[a-fA-F0-9]{40}/g;
    // Solana-style addresses (base58, 32-44 chars)
    const solRegex = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

    return ethRegex.test(text) || solRegex.test(text);
  }

  /**
   * Check for repeated characters (spam indicator)
   */
  private hasRepeatedCharacters(text: string): boolean {
    // Check for same character repeated 5+ times
    const repeatedRegex = /(.)\1{4,}/g;
    return repeatedRegex.test(text);
  }

  /**
   * Check for excessive capital letters
   */
  private hasExcessiveCaps(text: string): boolean {
    const words = text.split(/\s+/);
    if (words.length < 3) return false; // Too short to judge

    const capsWords = words.filter((word) => {
      const letters = word.replace(/[^a-zA-Z]/g, '');
      if (letters.length < 3) return false;
      const capsCount = (word.match(/[A-Z]/g) || []).length;
      return capsCount / letters.length > 0.7; // 70%+ caps
    });

    return capsWords.length / words.length > 0.5; // 50%+ words in caps
  }

  /**
   * Check for mass mentions
   */
  private hasMassMentions(text: string): boolean {
    const mentions = text.match(/@\w+/g) || [];
    return mentions.length >= 5; // 5 or more mentions
  }

  /**
   * Set spam mode for a group
   */
  async setSpamMode(groupId: string, mode: SpamMode): Promise<boolean> {
    try {
      await prisma.portal.update({
        where: { groupId },
        data: { spamMode: mode },
      });

      logger.info(`Set spam mode to ${mode} for group ${groupId}`);
      return true;
    } catch (error) {
      logger.error('Error setting spam mode:', error);
      return false;
    }
  }

  /**
   * Handle spam violation
   */
  async handleSpamViolation(
    groupId: string,
    userId: string,
    telegramUserId: bigint,
    result: SpamCheckResult
  ): Promise<void> {
    try {
      const config = await this.getSpamConfig(groupId);

      if (!config) return;

      // Add warning to trust level
      if (config.autoWarnUser) {
        await trustLevelService.addWarning(userId, groupId, result.reason);
      }

      // Check if should auto-mute
      if (result.action === 'mute' || config.autoMuteAfterWarnings) {
        const trustLevel = await trustLevelService.getTrustLevel(userId, groupId);

        if (trustLevel && trustLevel.warningCount >= config.autoMuteAfterWarnings) {
          await trustLevelService.muteUser(userId, groupId, config.muteDuration);
          logger.warn(
            `Auto-muted user ${telegramUserId} in group ${groupId} for ${config.muteDuration}s due to spam violations`
          );
        }
      }

      logger.info(`Handled spam violation for user ${telegramUserId} in group ${groupId}: ${result.reason}`);
    } catch (error) {
      logger.error('Error handling spam violation:', error);
    }
  }

  /**
   * Get spam statistics for a group
   */
  async getSpamStats(groupId: string) {
    try {
      const activities = await prisma.messageActivity.findMany({
        where: { groupId },
      });

      const totalViolations = activities.reduce((sum, a) => sum + a.violationCount, 0);
      const usersWithViolations = activities.filter((a) => a.violationCount > 0).length;

      const recentViolations = await prisma.messageActivity.count({
        where: {
          groupId,
          lastViolationAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      });

      return {
        totalUsers: activities.length,
        totalViolations,
        usersWithViolations,
        recentViolations24h: recentViolations,
      };
    } catch (error) {
      logger.error('Error getting spam stats:', error);
      return null;
    }
  }

  /**
   * Whitelist a domain for URL filtering
   */
  async whitelistDomain(groupId: string, domain: string): Promise<boolean> {
    try {
      const config = await this.getSpamConfig(groupId);

      if (!config) return false;

      const whitelist = config.whitelistedDomains ? JSON.parse(config.whitelistedDomains) : [];

      if (!whitelist.includes(domain)) {
        whitelist.push(domain);
      }

      await prisma.spamConfig.update({
        where: { groupId },
        data: { whitelistedDomains: JSON.stringify(whitelist) },
      });

      logger.info(`Whitelisted domain ${domain} for group ${groupId}`);
      return true;
    } catch (error) {
      logger.error('Error whitelisting domain:', error);
      return false;
    }
  }

  /**
   * Remove domain from whitelist
   */
  async removeWhitelistedDomain(groupId: string, domain: string): Promise<boolean> {
    try {
      const config = await this.getSpamConfig(groupId);

      if (!config || !config.whitelistedDomains) return false;

      const whitelist = JSON.parse(config.whitelistedDomains);
      const filtered = whitelist.filter((d: string) => d !== domain);

      await prisma.spamConfig.update({
        where: { groupId },
        data: { whitelistedDomains: JSON.stringify(filtered) },
      });

      logger.info(`Removed ${domain} from whitelist for group ${groupId}`);
      return true;
    } catch (error) {
      logger.error('Error removing whitelisted domain:', error);
      return false;
    }
  }
}

export default new SpamControlService();
