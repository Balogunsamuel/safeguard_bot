import { User as TelegramUser } from 'telegraf/typings/core/types/typegram';
import prisma from '../utils/database';
import logger from '../utils/logger';

export class UserService {
  /**
   * Create or update a user from Telegram user data
   */
  async upsertUser(telegramUser: TelegramUser) {
    try {
      const user = await prisma.user.upsert({
        where: { telegramId: BigInt(telegramUser.id) },
        update: {
          username: telegramUser.username,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name,
          isBot: telegramUser.is_bot,
        },
        create: {
          telegramId: BigInt(telegramUser.id),
          username: telegramUser.username,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name,
          isBot: telegramUser.is_bot,
        },
      });

      logger.debug(`User upserted: ${user.id} (Telegram ID: ${telegramUser.id})`);
      return user;
    } catch (error) {
      logger.error('Error upserting user:', error);
      throw error;
    }
  }

  /**
   * Get user by Telegram ID
   */
  async getUserByTelegramId(telegramId: number) {
    try {
      return await prisma.user.findUnique({
        where: { telegramId: BigInt(telegramId) },
        include: { verifications: true },
      });
    } catch (error) {
      logger.error('Error fetching user:', error);
      throw error;
    }
  }

  /**
   * Check if user is admin
   */
  async isAdmin(telegramId: number): Promise<boolean> {
    try {
      const admin = await prisma.admin.findUnique({
        where: { telegramId: BigInt(telegramId), isActive: true },
      });
      return !!admin;
    } catch (error) {
      logger.error('Error checking admin status:', error);
      return false;
    }
  }

  /**
   * Get all verified users count
   */
  async getVerifiedUsersCount(): Promise<number> {
    try {
      return await prisma.groupVerification.count({
        where: { isVerified: true },
      });
    } catch (error) {
      logger.error('Error counting verified users:', error);
      return 0;
    }
  }
}

export default new UserService();
