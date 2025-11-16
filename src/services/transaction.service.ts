import prisma from '../utils/database';
import logger from '../utils/logger';

export interface TransactionData {
  tokenId: string;
  txHash: string;
  chain: string;
  walletAddress: string;
  type: 'buy' | 'sell';
  amountToken: number;
  amountNative: number;
  priceUsd?: number;
  timestamp: Date;
  blockNumber?: bigint;
}

export class TransactionService {
  /**
   * Record a new transaction
   */
  async recordTransaction(data: TransactionData) {
    try {
      // Check if transaction already exists
      const existing = await prisma.transaction.findUnique({
        where: {
          chain_txHash: {
            chain: data.chain,
            txHash: data.txHash,
          },
        },
      });

      if (existing) {
        logger.debug(`Transaction ${data.txHash} already recorded`);
        return existing;
      }

      // Create new transaction
      const transaction = await prisma.transaction.create({
        data: {
          tokenId: data.tokenId,
          txHash: data.txHash,
          chain: data.chain,
          walletAddress: data.walletAddress,
          type: data.type,
          amountToken: data.amountToken,
          amountNative: data.amountNative,
          priceUsd: data.priceUsd,
          timestamp: data.timestamp,
          blockNumber: data.blockNumber,
          alertSent: false,
        },
      });

      logger.info(
        `Transaction recorded: ${data.type} ${data.amountToken} tokens (${data.txHash})`
      );

      // Update daily stats
      await this.updateDailyStats(data);

      return transaction;
    } catch (error: any) {
      // Handle duplicate transaction error (race condition)
      if (error.code === 'P2002') {
        // Prisma unique constraint violation
        logger.debug(`Transaction ${data.txHash} already exists (race condition)`);
        const existing = await prisma.transaction.findUnique({
          where: {
            chain_txHash: {
              chain: data.chain,
              txHash: data.txHash,
            },
          },
        });
        return existing!;
      }

      logger.error('Error recording transaction:', error);
      throw error;
    }
  }

  /**
   * Get transaction by hash
   */
  async getTransactionByHash(chain: string, txHash: string) {
    try {
      return await prisma.transaction.findUnique({
        where: {
          chain_txHash: {
            chain,
            txHash,
          },
        },
      });
    } catch (error) {
      logger.error('Error getting transaction by hash:', error);
      return null;
    }
  }

  /**
   * Mark transaction alert as sent
   */
  async markAlertSent(transactionId: string) {
    try {
      await prisma.transaction.update({
        where: { id: transactionId },
        data: { alertSent: true },
      });
    } catch (error) {
      logger.error('Error marking alert as sent:', error);
    }
  }

  /**
   * Get recent transactions for a token
   */
  async getRecentTransactions(tokenId: string, limit = 10) {
    try {
      return await prisma.transaction.findMany({
        where: { tokenId },
        orderBy: { timestamp: 'desc' },
        take: limit,
        include: { token: true },
      });
    } catch (error) {
      logger.error('Error fetching recent transactions:', error);
      return [];
    }
  }

  /**
   * Update daily statistics
   */
  private async updateDailyStats(data: TransactionData) {
    try {
      const date = new Date(data.timestamp);
      date.setHours(0, 0, 0, 0);

      const token = await prisma.trackedToken.findUnique({
        where: { id: data.tokenId },
      });

      if (!token) return;

      // Upsert daily stats
      await prisma.dailyStats.upsert({
        where: {
          date_chain_tokenAddress: {
            date,
            chain: data.chain,
            tokenAddress: token.tokenAddress,
          },
        },
        update: {
          buyCount: data.type === 'buy' ? { increment: 1 } : undefined,
          sellCount: data.type === 'sell' ? { increment: 1 } : undefined,
          volumeUsd: data.priceUsd ? { increment: data.priceUsd } : undefined,
          uniqueBuyers:
            data.type === 'buy' ? { increment: 1 } : undefined,
          uniqueSellers:
            data.type === 'sell' ? { increment: 1 } : undefined,
        },
        create: {
          date,
          chain: data.chain,
          tokenAddress: token.tokenAddress,
          tokenSymbol: token.tokenSymbol,
          buyCount: data.type === 'buy' ? 1 : 0,
          sellCount: data.type === 'sell' ? 1 : 0,
          volumeUsd: data.priceUsd || 0,
          uniqueBuyers: data.type === 'buy' ? 1 : 0,
          uniqueSellers: data.type === 'sell' ? 1 : 0,
        },
      });
    } catch (error) {
      logger.error('Error updating daily stats:', error);
    }
  }

  /**
   * Get daily stats for a token
   */
  async getDailyStats(chain: string, tokenAddress: string, days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      return await prisma.dailyStats.findMany({
        where: {
          chain,
          tokenAddress,
          date: { gte: startDate },
        },
        orderBy: { date: 'desc' },
      });
    } catch (error) {
      logger.error('Error fetching daily stats:', error);
      return [];
    }
  }
}

export default new TransactionService();
