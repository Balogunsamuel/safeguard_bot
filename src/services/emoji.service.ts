import prisma from '../utils/database';
import logger from '../utils/logger';

export interface EmojiTierConfig {
  minUsd: number;
  maxUsd: number | null;
  emoji: string;
  label?: string;
}

export class EmojiService {
  // In-memory cache for fast lookups
  private tierCache: Map<string, EmojiTierConfig[]> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private cacheTimestamps: Map<string, number> = new Map();

  /**
   * Add or update emoji tier for a token
   */
  async setEmojiTier(
    tokenId: string,
    minUsd: number,
    maxUsd: number | null,
    emoji: string,
    label?: string
  ): Promise<void> {
    try {
      // Check if tier with same minUsd already exists
      const existing = await prisma.emojiTier.findFirst({
        where: { tokenId, minUsd },
      });

      if (existing) {
        await prisma.emojiTier.update({
          where: { id: existing.id },
          data: { maxUsd, emoji, label },
        });
      } else {
        await prisma.emojiTier.create({
          data: { tokenId, minUsd, maxUsd, emoji, label },
        });
      }

      // Invalidate cache
      this.tierCache.delete(tokenId);
      this.cacheTimestamps.delete(tokenId);

      logger.info(`Emoji tier set for token ${tokenId}: ${emoji} (${minUsd}-${maxUsd || '∞'})`);
    } catch (error) {
      logger.error('Error setting emoji tier:', error);
      throw error;
    }
  }

  /**
   * Get all emoji tiers for a token (with caching)
   */
  async getEmojiTiers(tokenId: string): Promise<EmojiTierConfig[]> {
    try {
      // Check cache
      const cached = this.tierCache.get(tokenId);
      const cacheTime = this.cacheTimestamps.get(tokenId);

      if (cached && cacheTime && Date.now() - cacheTime < this.CACHE_TTL) {
        return cached;
      }

      // Fetch from database
      const tiers = await prisma.emojiTier.findMany({
        where: { tokenId },
        orderBy: { minUsd: 'asc' },
      });

      const config: EmojiTierConfig[] = tiers.map((tier) => ({
        minUsd: tier.minUsd,
        maxUsd: tier.maxUsd,
        emoji: tier.emoji,
        label: tier.label || undefined,
      }));

      // Update cache
      this.tierCache.set(tokenId, config);
      this.cacheTimestamps.set(tokenId, Date.now());

      return config;
    } catch (error) {
      logger.error('Error getting emoji tiers:', error);
      return [];
    }
  }

  /**
   * Get emoji for a specific USD value
   */
  async getEmojiForValue(tokenId: string, usdValue: number): Promise<string> {
    try {
      const tiers = await this.getEmojiTiers(tokenId);

      if (tiers.length === 0) {
        // Default emoji based on value
        return this.getDefaultEmoji(usdValue);
      }

      // Find matching tier
      for (const tier of tiers) {
        if (usdValue >= tier.minUsd) {
          if (tier.maxUsd === null || usdValue < tier.maxUsd) {
            return tier.emoji;
          }
        }
      }

      // Return last tier's emoji if no match found
      return tiers[tiers.length - 1].emoji;
    } catch (error) {
      logger.error('Error getting emoji for value:', error);
      return this.getDefaultEmoji(usdValue);
    }
  }

  /**
   * Delete emoji tier
   */
  async deleteEmojiTier(tokenId: string, minUsd: number): Promise<void> {
    try {
      await prisma.emojiTier.deleteMany({
        where: { tokenId, minUsd },
      });

      // Invalidate cache
      this.tierCache.delete(tokenId);
      this.cacheTimestamps.delete(tokenId);

      logger.info(`Emoji tier deleted for token ${tokenId}: ${minUsd}`);
    } catch (error) {
      logger.error('Error deleting emoji tier:', error);
      throw error;
    }
  }

  /**
   * Clear all emoji tiers for a token
   */
  async clearEmojiTiers(tokenId: string): Promise<void> {
    try {
      await prisma.emojiTier.deleteMany({
        where: { tokenId },
      });

      // Invalidate cache
      this.tierCache.delete(tokenId);
      this.cacheTimestamps.delete(tokenId);

      logger.info(`All emoji tiers cleared for token ${tokenId}`);
    } catch (error) {
      logger.error('Error clearing emoji tiers:', error);
      throw error;
    }
  }

  /**
   * Set default emoji tiers for a token
   */
  async setDefaultTiers(tokenId: string): Promise<void> {
    const defaultTiers: EmojiTierConfig[] = [
      { minUsd: 0, maxUsd: 50, emoji: '🐟', label: 'Small' },
      { minUsd: 50, maxUsd: 200, emoji: '🐠', label: 'Medium' },
      { minUsd: 200, maxUsd: 1000, emoji: '🐬', label: 'Large' },
      { minUsd: 1000, maxUsd: 5000, emoji: '🦈', label: 'Shark' },
      { minUsd: 5000, maxUsd: null, emoji: '🐋', label: 'Whale' },
    ];

    for (const tier of defaultTiers) {
      await this.setEmojiTier(tokenId, tier.minUsd, tier.maxUsd, tier.emoji, tier.label);
    }
  }

  /**
   * Get default emoji based on USD value
   */
  private getDefaultEmoji(usdValue: number): string {
    if (usdValue < 50) return '💰';
    if (usdValue < 200) return '💵';
    if (usdValue < 1000) return '💸';
    if (usdValue < 5000) return '🤑';
    return '🐋';
  }
}

export default new EmojiService();