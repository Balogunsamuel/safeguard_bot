import prisma from '../utils/database';
import logger from '../utils/logger';

export interface TrendingTokenData {
  chain: string;
  tokenAddress: string;
  tokenSymbol: string;
  buyCount1h: number;
  volumeUsd1h: number;
  score: number;
  rank: number;
}

export class TrendingService {
  /**
   * Calculate and update trending tokens
   */
  async updateTrendingTokens(): Promise<TrendingTokenData[]> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      // Get all transactions from last hour
      const recentTxs = await prisma.transaction.findMany({
        where: {
          timestamp: { gte: oneHourAgo },
          type: 'buy',
        },
        include: {
          token: true,
        },
      });

      // Aggregate by token
      const tokenStats = new Map<
        string,
        {
          chain: string;
          tokenAddress: string;
          tokenSymbol: string;
          buyCount: number;
          volumeUsd: number;
        }
      >();

      for (const tx of recentTxs) {
        const key = `${tx.chain}:${tx.token.tokenAddress}`;

        if (!tokenStats.has(key)) {
          tokenStats.set(key, {
            chain: tx.chain,
            tokenAddress: tx.token.tokenAddress,
            tokenSymbol: tx.token.tokenSymbol,
            buyCount: 0,
            volumeUsd: 0,
          });
        }

        const stats = tokenStats.get(key)!;
        stats.buyCount += 1;
        stats.volumeUsd += tx.priceUsd || 0;
      }

      // Calculate trending score
      // Score = (buyCount * 0.3) + (volumeUsd * 0.7)
      // Normalized to make both factors comparable
      const trending: TrendingTokenData[] = Array.from(tokenStats.values())
        .map((stats) => {
          const normalizedBuys = Math.log10(stats.buyCount + 1) * 10;
          const normalizedVolume = Math.log10(stats.volumeUsd + 1);

          return {
            chain: stats.chain,
            tokenAddress: stats.tokenAddress,
            tokenSymbol: stats.tokenSymbol,
            buyCount1h: stats.buyCount,
            volumeUsd1h: stats.volumeUsd,
            score: normalizedBuys * 0.3 + normalizedVolume * 0.7,
            rank: 0,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);

      // Assign ranks
      trending.forEach((token, index) => {
        token.rank = index + 1;
      });

      // Save to database
      const timestamp = new Date();
      for (const token of trending) {
        await prisma.trendingToken.create({
          data: {
            chain: token.chain,
            tokenAddress: token.tokenAddress,
            tokenSymbol: token.tokenSymbol,
            rank: token.rank,
            buyCount1h: token.buyCount1h,
            volumeUsd1h: token.volumeUsd1h,
            score: token.score,
            timestamp,
          },
        });
      }

      // Clean up old trending data (keep last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      await prisma.trendingToken.deleteMany({
        where: { timestamp: { lt: sevenDaysAgo } },
      });

      logger.info(`Updated trending tokens: ${trending.length} tokens`);
      return trending;
    } catch (error) {
      logger.error('Error updating trending tokens:', error);
      return [];
    }
  }

  /**
   * Get current trending tokens
   */
  async getTrendingTokens(limit = 10): Promise<TrendingTokenData[]> {
    try {
      // Get latest trending snapshot
      const latest = await prisma.trendingToken.findFirst({
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      });

      if (!latest) {
        return [];
      }

      const trending = await prisma.trendingToken.findMany({
        where: { timestamp: latest.timestamp },
        orderBy: { rank: 'asc' },
        take: limit,
      });

      return trending.map((t) => ({
        chain: t.chain,
        tokenAddress: t.tokenAddress,
        tokenSymbol: t.tokenSymbol,
        buyCount1h: t.buyCount1h,
        volumeUsd1h: t.volumeUsd1h,
        score: t.score,
        rank: t.rank,
      }));
    } catch (error) {
      logger.error('Error getting trending tokens:', error);
      return [];
    }
  }

  /**
   * Get trending history for a token
   */
  async getTokenTrendingHistory(chain: string, tokenAddress: string, days = 7) {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      return await prisma.trendingToken.findMany({
        where: {
          chain,
          tokenAddress,
          timestamp: { gte: startDate },
        },
        orderBy: { timestamp: 'desc' },
      });
    } catch (error) {
      logger.error('Error getting token trending history:', error);
      return [];
    }
  }
}

export default new TrendingService();