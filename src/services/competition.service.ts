import prisma from '../utils/database';
import logger from '../utils/logger';

export interface CompetitionData {
  groupId: string;
  tokenId?: string;
  name: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  prizeInfo?: string;
}

export interface LeaderboardEntry {
  walletAddress: string;
  totalBuys: number;
  totalVolume: number;
  largestBuy: number;
  rank: number;
}

export class CompetitionService {
  /**
   * Create a new buy competition
   */
  async createCompetition(data: CompetitionData) {
    try {
      const competition = await prisma.competition.create({
        data: {
          groupId: data.groupId,
          tokenId: data.tokenId,
          name: data.name,
          description: data.description,
          startTime: data.startTime,
          endTime: data.endTime,
          prizeInfo: data.prizeInfo,
          isActive: true,
        },
      });

      logger.info(`Competition created: ${data.name} (${competition.id})`);
      return competition;
    } catch (error) {
      logger.error('Error creating competition:', error);
      throw error;
    }
  }

  /**
   * Stop/end a competition
   */
  async endCompetition(competitionId: string, winnerId?: string) {
    try {
      await prisma.competition.update({
        where: { id: competitionId },
        data: {
          isActive: false,
          winnerId,
        },
      });

      logger.info(`Competition ended: ${competitionId}`);
    } catch (error) {
      logger.error('Error ending competition:', error);
      throw error;
    }
  }

  /**
   * Get active competition for a group
   */
  async getActiveCompetition(groupId: string) {
    try {
      const now = new Date();

      return await prisma.competition.findFirst({
        where: {
          groupId,
          isActive: true,
          startTime: { lte: now },
          endTime: { gte: now },
        },
        orderBy: { startTime: 'desc' },
      });
    } catch (error) {
      logger.error('Error getting active competition:', error);
      return null;
    }
  }

  /**
   * Get competition leaderboard
   */
  async getLeaderboard(competitionId: string, limit = 10): Promise<LeaderboardEntry[]> {
    try {
      const competition = await prisma.competition.findUnique({
        where: { id: competitionId },
      });

      if (!competition) {
        return [];
      }

      // Build query filters
      const where: any = {
        timestamp: {
          gte: competition.startTime,
          lte: competition.endTime,
        },
        type: 'buy',
      };

      // If token-specific competition
      if (competition.tokenId) {
        where.tokenId = competition.tokenId;
      } else {
        // All tokens in the group
        const tokens = await prisma.trackedToken.findMany({
          where: { groupId: competition.groupId },
          select: { id: true },
        });
        where.tokenId = { in: tokens.map((t) => t.id) };
      }

      // Aggregate transactions by wallet
      const transactions = await prisma.transaction.findMany({
        where,
        select: {
          walletAddress: true,
          priceUsd: true,
        },
      });

      // Calculate leaderboard
      const walletStats = new Map<
        string,
        { totalBuys: number; totalVolume: number; largestBuy: number }
      >();

      for (const tx of transactions) {
        const wallet = tx.walletAddress;
        const volume = tx.priceUsd || 0;

        if (!walletStats.has(wallet)) {
          walletStats.set(wallet, {
            totalBuys: 0,
            totalVolume: 0,
            largestBuy: 0,
          });
        }

        const stats = walletStats.get(wallet)!;
        stats.totalBuys += 1;
        stats.totalVolume += volume;
        stats.largestBuy = Math.max(stats.largestBuy, volume);
      }

      // Sort by total volume
      const leaderboard: LeaderboardEntry[] = Array.from(walletStats.entries())
        .map(([wallet, stats]) => ({
          walletAddress: wallet,
          totalBuys: stats.totalBuys,
          totalVolume: stats.totalVolume,
          largestBuy: stats.largestBuy,
          rank: 0,
        }))
        .sort((a, b) => b.totalVolume - a.totalVolume)
        .slice(0, limit);

      // Assign ranks
      leaderboard.forEach((entry, index) => {
        entry.rank = index + 1;
      });

      return leaderboard;
    } catch (error) {
      logger.error('Error getting leaderboard:', error);
      return [];
    }
  }

  /**
   * Update pinned message ID for competition
   */
  async updatePinnedMessage(competitionId: string, messageId: number) {
    try {
      await prisma.competition.update({
        where: { id: competitionId },
        data: { pinnedMessageId: messageId },
      });
    } catch (error) {
      logger.error('Error updating pinned message:', error);
    }
  }

  /**
   * Get all competitions for a group
   */
  async getGroupCompetitions(groupId: string, includeInactive = false) {
    try {
      const where: any = { groupId };

      if (!includeInactive) {
        where.isActive = true;
      }

      return await prisma.competition.findMany({
        where,
        orderBy: { startTime: 'desc' },
      });
    } catch (error) {
      logger.error('Error getting group competitions:', error);
      return [];
    }
  }

  /**
   * Check and auto-end expired competitions
   */
  async autoEndExpiredCompetitions() {
    try {
      const now = new Date();

      const expired = await prisma.competition.findMany({
        where: {
          isActive: true,
          endTime: { lt: now },
        },
      });

      for (const competition of expired) {
        // Get winner
        const leaderboard = await this.getLeaderboard(competition.id, 1);
        const winnerId = leaderboard.length > 0 ? leaderboard[0].walletAddress : undefined;

        await this.endCompetition(competition.id, winnerId);
        logger.info(`Auto-ended competition: ${competition.name}`);
      }
    } catch (error) {
      logger.error('Error auto-ending competitions:', error);
    }
  }
}

export default new CompetitionService();