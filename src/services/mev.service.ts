import prisma from '../utils/database';
import logger from '../utils/logger';

export class MevService {
  // In-memory cache for blacklist (for fast lookups)
  private blacklistCache: Map<string, Set<string>> = new Map();
  private lastCacheUpdate = 0;
  private readonly CACHE_TTL = 60 * 1000; // 1 minute

  // Known MEV bot wallets (initial seed)
  private readonly KNOWN_MEV_BOTS = {
    ethereum: [
      '0xae2fc483527b8ef99eb5d9b44875f005ba1fae13', // jaredfromsubway.eth
      '0x00000000007f150bd6f54c40a34d7c3d5e9f56aa', // MEV Bot
      '0x000000000035b5e5ad9019092c665357240f594e', // MEV Bot
      '0x00000000009e50a7ddb7a81e3b6ad7fcf24bb292', // MEV Bot
      '0x6980a47bee930a4584b09ee79ebe46484fbdbdd0', // MEV Bot
      '0x51c72848c68a965f66fa7a88855f9f7784502a7f', // MEV Bot
      '0xa57bd00134b2850b2a1c55860c9e9ea100fdd6cf', // MEV Bot
    ],
    bsc: [
      '0x8894e0a0c962cb723c1976a4421c95949be2d4e3', // BSC MEV Bot
      '0x51c72848c68a965f66fa7a88855f9f7784502a7f', // MEV Bot
    ],
    solana: [
      'AxqeCjfz5Q4QR1cVkgaAK8LvXUAdXV5eM7yKwgKhPu3B', // Jito MEV
      'JiToZu6RrFvTjsv2vqT5mJxYQ9L7L3qY5h7J7fFGzCuQ', // Jito MEV
    ],
  };

  constructor() {
    this.initializeBlacklist();
  }

  /**
   * Initialize blacklist with known MEV bots
   */
  private async initializeBlacklist() {
    try {
      // Check if blacklist is empty
      const count = await prisma.mevBlacklist.count();

      if (count === 0) {
        logger.info('Initializing MEV blacklist with known bots...');

        // Add known MEV bots
        for (const [chain, wallets] of Object.entries(this.KNOWN_MEV_BOTS)) {
          for (const wallet of wallets) {
            await this.addToBlacklist(
              wallet.toLowerCase(),
              chain as 'ethereum' | 'bsc' | 'solana',
              'Known MEV bot',
              'system'
            );
          }
        }

        logger.info(`Added ${count} known MEV bots to blacklist`);
      }
    } catch (error) {
      logger.error('Error initializing MEV blacklist:', error);
    }
  }

  /**
   * Add wallet to MEV blacklist
   */
  async addToBlacklist(
    walletAddress: string,
    chain: 'ethereum' | 'bsc' | 'solana' | 'all',
    reason?: string,
    addedBy?: string
  ): Promise<void> {
    try {
      const normalized = walletAddress.toLowerCase();

      await prisma.mevBlacklist.upsert({
        where: { walletAddress: normalized },
        update: { isActive: true, reason, addedBy },
        create: {
          walletAddress: normalized,
          chain,
          reason,
          addedBy,
          isActive: true,
        },
      });

      // Invalidate cache
      this.lastCacheUpdate = 0;

      logger.info(`Added ${normalized} to MEV blacklist (${chain})`);
    } catch (error) {
      logger.error('Error adding to MEV blacklist:', error);
      throw error;
    }
  }

  /**
   * Remove wallet from MEV blacklist
   */
  async removeFromBlacklist(walletAddress: string): Promise<void> {
    try {
      const normalized = walletAddress.toLowerCase();

      await prisma.mevBlacklist.updateMany({
        where: { walletAddress: normalized },
        data: { isActive: false },
      });

      // Invalidate cache
      this.lastCacheUpdate = 0;

      logger.info(`Removed ${normalized} from MEV blacklist`);
    } catch (error) {
      logger.error('Error removing from MEV blacklist:', error);
      throw error;
    }
  }

  /**
   * Check if wallet is in MEV blacklist (fast cached check)
   */
  async isBlacklisted(walletAddress: string, chain: string): Promise<boolean> {
    try {
      await this.refreshCacheIfNeeded();

      const normalized = walletAddress.toLowerCase();

      // Check chain-specific blacklist
      const chainSet = this.blacklistCache.get(chain);
      if (chainSet && chainSet.has(normalized)) {
        return true;
      }

      // Check global blacklist
      const allSet = this.blacklistCache.get('all');
      if (allSet && allSet.has(normalized)) {
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Error checking MEV blacklist:', error);
      return false;
    }
  }

  /**
   * Get all blacklisted wallets
   */
  async getBlacklist(chain?: string): Promise<any[]> {
    try {
      const where: any = { isActive: true };

      if (chain) {
        where.OR = [{ chain }, { chain: 'all' }];
      }

      return await prisma.mevBlacklist.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      logger.error('Error getting MEV blacklist:', error);
      return [];
    }
  }

  /**
   * Refresh cache if needed
   */
  private async refreshCacheIfNeeded() {
    const now = Date.now();

    if (now - this.lastCacheUpdate > this.CACHE_TTL) {
      await this.refreshCache();
    }
  }

  /**
   * Refresh blacklist cache
   */
  private async refreshCache() {
    try {
      const blacklist = await prisma.mevBlacklist.findMany({
        where: { isActive: true },
      });

      // Clear existing cache
      this.blacklistCache.clear();

      // Rebuild cache
      for (const entry of blacklist) {
        if (!this.blacklistCache.has(entry.chain)) {
          this.blacklistCache.set(entry.chain, new Set());
        }

        this.blacklistCache.get(entry.chain)!.add(entry.walletAddress);
      }

      this.lastCacheUpdate = Date.now();
      logger.debug(`MEV blacklist cache refreshed: ${blacklist.length} entries`);
    } catch (error) {
      logger.error('Error refreshing MEV blacklist cache:', error);
    }
  }

  /**
   * Add multiple wallets to blacklist (bulk)
   */
  async addBulk(
    wallets: Array<{ address: string; chain: string; reason?: string }>,
    addedBy?: string
  ): Promise<void> {
    try {
      for (const wallet of wallets) {
        await this.addToBlacklist(
          wallet.address,
          wallet.chain as any,
          wallet.reason,
          addedBy
        );
      }

      logger.info(`Bulk added ${wallets.length} wallets to MEV blacklist`);
    } catch (error) {
      logger.error('Error bulk adding to MEV blacklist:', error);
      throw error;
    }
  }
}

export default new MevService();