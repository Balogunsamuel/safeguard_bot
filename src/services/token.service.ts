import prisma from '../utils/database';
import logger from '../utils/logger';

export interface AddTokenParams {
  groupId: string;
  chain: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName?: string;
  pairAddress?: string;
  minAmount?: number;
}

export class TokenService {
  /**
   * Add a token to track for a group
   */
  async addTrackedToken(params: AddTokenParams) {
    try {
      const token = await prisma.trackedToken.create({
        data: {
          groupId: params.groupId,
          chain: params.chain.toLowerCase(),
          tokenAddress: params.tokenAddress,
          tokenSymbol: params.tokenSymbol,
          tokenName: params.tokenName,
          pairAddress: params.pairAddress,
          minAmount: params.minAmount || 0,
          isActive: true,
        },
      });

      logger.info(
        `Token ${params.tokenSymbol} added for tracking in group ${params.groupId} on ${params.chain}`
      );
      return token;
    } catch (error) {
      logger.error('Error adding tracked token:', error);
      throw error;
    }
  }

  /**
   * Remove a tracked token
   */
  async removeTrackedToken(tokenId: string) {
    try {
      await prisma.trackedToken.update({
        where: { id: tokenId },
        data: { isActive: false },
      });

      logger.info(`Token ${tokenId} deactivated`);
    } catch (error) {
      logger.error('Error removing tracked token:', error);
      throw error;
    }
  }

  /**
   * Get all tracked tokens for a group
   */
  async getGroupTokens(groupId: string) {
    try {
      return await prisma.trackedToken.findMany({
        where: { groupId, isActive: true },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      logger.error('Error fetching group tokens:', error);
      return [];
    }
  }

  /**
   * Get all active tracked tokens by chain
   */
  async getActiveTokensByChain(chain: string) {
    try {
      return await prisma.trackedToken.findMany({
        where: { chain: chain.toLowerCase(), isActive: true },
        include: { group: true },
      });
    } catch (error) {
      logger.error('Error fetching active tokens:', error);
      return [];
    }
  }

  /**
   * Update token minimum alert threshold
   */
  async updateMinAmount(tokenId: string, minAmount: number) {
    try {
      return await prisma.trackedToken.update({
        where: { id: tokenId },
        data: { minAmount },
      });
    } catch (error) {
      logger.error('Error updating token min amount:', error);
      throw error;
    }
  }

  /**
   * Get token by address and chain
   */
  async getTokenByAddress(chain: string, tokenAddress: string) {
    try {
      return await prisma.trackedToken.findMany({
        where: {
          chain: chain.toLowerCase(),
          tokenAddress,
          isActive: true,
        },
        include: { group: true },
      });
    } catch (error) {
      logger.error('Error fetching token by address:', error);
      return [];
    }
  }
}

export default new TokenService();
