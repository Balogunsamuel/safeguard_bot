import { Chat } from 'telegraf/typings/core/types/typegram';
import prisma from '../utils/database';
import logger from '../utils/logger';

export class GroupService {
  /**
   * Create or update a group from Telegram chat data
   */
  async upsertGroup(chat: Chat.GroupChat | Chat.SupergroupChat | Chat.ChannelChat) {
    try {
      const group = await prisma.group.upsert({
        where: { telegramId: BigInt(chat.id) },
        update: {
          title: chat.title,
          type: chat.type,
        },
        create: {
          telegramId: BigInt(chat.id),
          title: chat.title,
          type: chat.type,
          isActive: true,
        },
      });

      logger.debug(`Group upserted: ${group.id} (${chat.title})`);
      return group;
    } catch (error) {
      logger.error('Error upserting group:', error);
      throw error;
    }
  }

  /**
   * Get group by Telegram ID
   */
  async getGroupByTelegramId(telegramId: number) {
    try {
      return await prisma.group.findUnique({
        where: { telegramId: BigInt(telegramId) },
        include: { trackedTokens: true },
      });
    } catch (error) {
      logger.error('Error fetching group:', error);
      throw error;
    }
  }

  /**
   * Verify a user in a group
   */
  async verifyUser(userId: string, groupId: string) {
    try {
      const verification = await prisma.groupVerification.upsert({
        where: {
          userId_groupId: {
            userId,
            groupId,
          },
        },
        update: {
          isVerified: true,
          verifiedAt: new Date(),
        },
        create: {
          userId,
          groupId,
          isVerified: true,
        },
      });

      logger.info(`User ${userId} verified in group ${groupId}`);
      return verification;
    } catch (error) {
      logger.error('Error verifying user:', error);
      throw error;
    }
  }

  /**
   * Check if user is verified in a group
   */
  async isUserVerified(userId: string, groupId: string): Promise<boolean> {
    try {
      const verification = await prisma.groupVerification.findUnique({
        where: {
          userId_groupId: {
            userId,
            groupId,
          },
        },
      });

      return verification?.isVerified ?? false;
    } catch (error) {
      logger.error('Error checking verification:', error);
      return false;
    }
  }

  /**
   * Get verified users count for a group
   */
  async getGroupVerifiedCount(groupId: string): Promise<number> {
    try {
      return await prisma.groupVerification.count({
        where: { groupId, isVerified: true },
      });
    } catch (error) {
      logger.error('Error counting verified users:', error);
      return 0;
    }
  }

  /**
   * Get all active groups
   */
  async getActiveGroups() {
    try {
      return await prisma.group.findMany({
        where: { isActive: true },
        include: { trackedTokens: true },
      });
    } catch (error) {
      logger.error('Error fetching active groups:', error);
      return [];
    }
  }
}

export default new GroupService();
