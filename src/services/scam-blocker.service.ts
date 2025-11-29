import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import { TrustLevel } from './trust-level.service';

const prisma = new PrismaClient();

/**
 * Scam check result
 */
export interface ScamCheckResult {
  isScam: boolean;
  type?: 'url' | 'telegram_link' | 'contract' | 'keyword' | 'unicode' | 'phishing';
  severity?: 'low' | 'medium' | 'high' | 'critical';
  pattern?: string;
  description?: string;
  shouldDelete: boolean;
  shouldBan: boolean;
}

class ScamBlockerService {
  // Known scam patterns (pre-loaded)
  private readonly SCAM_KEYWORDS = [
    'airdrop',
    'free crypto',
    'double your',
    'elon musk',
    'give away',
    'giveaway',
    'click here to claim',
    'urgent',
    'verify your wallet',
    'metamask support',
    'trust wallet support',
    'binance support',
    'coinbase support',
    'limited time',
    'act now',
    'send to receive',
  ];

  private readonly PHISHING_DOMAINS = [
    'metamask-support',
    'trustwallet-help',
    'binance-verify',
    'coinbase-secure',
    'uniswap-app',
    'pancakeswap-finance',
  ];

  private readonly URL_SHORTENERS = [
    'bit.ly',
    'tinyurl.com',
    'goo.gl',
    'ow.ly',
    't.co',
    'is.gd',
    'buff.ly',
    'bit.do',
  ];

  /**
   * Initialize scam patterns in database
   */
  async initializeScamPatterns(): Promise<void> {
    try {
      // Check if patterns already exist
      const count = await prisma.scamPattern.count();

      if (count > 0) {
        return; // Already initialized
      }

      // Add keyword patterns
      for (const keyword of this.SCAM_KEYWORDS) {
        await prisma.scamPattern.create({
          data: {
            pattern: keyword,
            type: 'keyword',
            severity: 'medium',
            description: `Scam keyword: ${keyword}`,
          },
        });
      }

      // Add phishing domain patterns
      for (const domain of this.PHISHING_DOMAINS) {
        await prisma.scamPattern.create({
          data: {
            pattern: domain,
            type: 'url',
            severity: 'high',
            description: `Known phishing domain: ${domain}`,
          },
        });
      }

      // Add URL shortener patterns (suspicious)
      for (const shortener of this.URL_SHORTENERS) {
        await prisma.scamPattern.create({
          data: {
            pattern: shortener,
            type: 'url',
            severity: 'low',
            description: `URL shortener: ${shortener}`,
          },
        });
      }

      // Add dangerous unicode patterns
      await prisma.scamPattern.create({
        data: {
          pattern: '[\u202E\u202D\u200E\u200F]', // Unicode direction override
          type: 'unicode',
          severity: 'critical',
          description: 'Unicode direction override attack',
        },
      });

      logger.info('Initialized scam detection patterns');
    } catch (error) {
      logger.error('Error initializing scam patterns:', error);
    }
  }

  /**
   * Check if a message contains scam content
   */
  async checkMessage(
    groupId: string,
    messageText: string,
    userTrustLevel: number
  ): Promise<ScamCheckResult> {
    try {
      // Trust Level 2+ users get lighter checking
      const strictMode = userTrustLevel === TrustLevel.NEW;

      // Check for unicode attacks (all users)
      const unicodeResult = this.checkUnicodeAttack(messageText);
      if (unicodeResult.isScam) {
        return { ...unicodeResult, shouldDelete: true, shouldBan: true };
      }

      // Only do deep scans for Level 1 users
      if (!strictMode) {
        return { isScam: false, shouldDelete: false, shouldBan: false };
      }

      // Check for scam keywords
      const keywordResult = await this.checkScamKeywords(messageText);
      if (keywordResult.isScam) {
        return keywordResult;
      }

      // Check for phishing URLs
      const urlResult = await this.checkPhishingURLs(messageText);
      if (urlResult.isScam) {
        return urlResult;
      }

      // Check for suspicious Telegram links
      const telegramResult = this.checkSuspiciousTelegramLinks(messageText);
      if (telegramResult.isScam) {
        return telegramResult;
      }

      // Check for fake contract addresses
      const contractResult = this.checkFakeContracts(messageText);
      if (contractResult.isScam) {
        return contractResult;
      }

      return { isScam: false, shouldDelete: false, shouldBan: false };
    } catch (error) {
      logger.error('Error checking message for scam:', error);
      return { isScam: false, shouldDelete: false, shouldBan: false };
    }
  }

  /**
   * Check for unicode direction override attacks
   */
  private checkUnicodeAttack(text: string): ScamCheckResult {
    // Right-to-left override and similar attacks
    const dangerousUnicode = /[\u202E\u202D\u200E\u200F\u061C]/g;

    if (dangerousUnicode.test(text)) {
      return {
        isScam: true,
        type: 'unicode',
        severity: 'critical',
        description: 'Unicode homoglyph/direction override attack detected',
        shouldDelete: true,
        shouldBan: true,
      };
    }

    // Check for homoglyph characters (lookalike characters)
    const hasHomoglyphs = this.detectHomoglyphs(text);
    if (hasHomoglyphs) {
      return {
        isScam: true,
        type: 'unicode',
        severity: 'high',
        description: 'Homoglyph characters detected (visual spoofing)',
        shouldDelete: true,
        shouldBan: false,
      };
    }

    return { isScam: false, shouldDelete: false, shouldBan: false };
  }

  /**
   * Detect homoglyph characters
   */
  private detectHomoglyphs(text: string): boolean {
    // Common homoglyphs used in scams
    const homoglyphs = [
      /[\u0430\u0435\u043E\u0440\u0441\u0445]/g, // Cyrillic lookalikes: а, е, о, р, с, х
      /[\u03BF\u03C1]/g, // Greek omicron, rho
      /[\u0D20]/g, // Malayalam tha (looks like 'o')
    ];

    return homoglyphs.some((pattern) => pattern.test(text));
  }

  /**
   * Check for scam keywords
   */
  private async checkScamKeywords(text: string): Promise<ScamCheckResult> {
    const lowerText = text.toLowerCase();

    // Get active keyword patterns from database
    const patterns = await prisma.scamPattern.findMany({
      where: { type: 'keyword', isActive: true },
    });

    for (const pattern of patterns) {
      if (lowerText.includes(pattern.pattern.toLowerCase())) {
        return {
          isScam: true,
          type: 'keyword',
          severity: pattern.severity as any,
          pattern: pattern.pattern,
          description: pattern.description || 'Scam keyword detected',
          shouldDelete: pattern.severity === 'high' || pattern.severity === 'critical',
          shouldBan: pattern.severity === 'critical',
        };
      }
    }

    // Check for common scam phrases
    const scamPhrases = [
      /claim.*airdrop/i,
      /free.*eth|btc|bnb|usdt/i,
      /double.*your.*(crypto|bitcoin|ethereum)/i,
      /verify.*wallet/i,
      /connect.*wallet.*to.*claim/i,
      /send.*\d+.*receive.*\d+/i,
    ];

    for (const phrase of scamPhrases) {
      if (phrase.test(text)) {
        return {
          isScam: true,
          type: 'keyword',
          severity: 'high',
          description: 'Common scam phrase detected',
          shouldDelete: true,
          shouldBan: false,
        };
      }
    }

    return { isScam: false, shouldDelete: false, shouldBan: false };
  }

  /**
   * Check for phishing URLs
   */
  private async checkPhishingURLs(text: string): Promise<ScamCheckResult> {
    // Extract URLs from text
    const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|net|org|io|xyz|me|co)[^\s]*)/gi;
    const urls = text.match(urlRegex) || [];

    if (urls.length === 0) {
      return { isScam: false, shouldDelete: false, shouldBan: false };
    }

    // Get active URL patterns from database
    const patterns = await prisma.scamPattern.findMany({
      where: { type: 'url', isActive: true },
    });

    for (const url of urls) {
      const lowerUrl = url.toLowerCase();

      // Check against known phishing domains
      for (const pattern of patterns) {
        if (lowerUrl.includes(pattern.pattern.toLowerCase())) {
          return {
            isScam: true,
            type: 'url',
            severity: pattern.severity as any,
            pattern: pattern.pattern,
            description: pattern.description || 'Phishing URL detected',
            shouldDelete: true,
            shouldBan: pattern.severity === 'critical' || pattern.severity === 'high',
          };
        }
      }

      // Check for suspicious TLDs
      const suspiciousTLDs = ['.tk', '.ml', '.ga', '.cf', '.gq', '.zip', '.xyz'];
      if (suspiciousTLDs.some((tld) => lowerUrl.endsWith(tld))) {
        return {
          isScam: true,
          type: 'url',
          severity: 'medium',
          description: 'Suspicious domain TLD',
          shouldDelete: true,
          shouldBan: false,
        };
      }

      // Check for URL shorteners (suspicious but not always scam)
      if (this.URL_SHORTENERS.some((shortener) => lowerUrl.includes(shortener))) {
        return {
          isScam: true,
          type: 'url',
          severity: 'low',
          description: 'URL shortener detected (potentially hiding destination)',
          shouldDelete: false,
          shouldBan: false,
        };
      }

      // Check for IP addresses in URLs (suspicious)
      if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(lowerUrl)) {
        return {
          isScam: true,
          type: 'url',
          severity: 'medium',
          description: 'URL contains IP address (suspicious)',
          shouldDelete: true,
          shouldBan: false,
        };
      }
    }

    return { isScam: false, shouldDelete: false, shouldBan: false };
  }

  /**
   * Check for suspicious Telegram links
   */
  private checkSuspiciousTelegramLinks(text: string): ScamCheckResult {
    // Extract Telegram links
    const telegramRegex = /(t\.me\/|telegram\.me\/)([a-zA-Z0-9_]+)/gi;
    const matches = text.match(telegramRegex);

    if (!matches) {
      return { isScam: false, shouldDelete: false, shouldBan: false };
    }

    // Check for suspicious patterns in Telegram usernames
    const suspiciousPatterns = [
      /support/i,
      /help/i,
      /verify/i,
      /admin/i,
      /official/i,
      /team/i,
    ];

    for (const match of matches) {
      if (suspiciousPatterns.some((pattern) => pattern.test(match))) {
        return {
          isScam: true,
          type: 'telegram_link',
          severity: 'medium',
          description: 'Suspicious Telegram link (possible impersonation)',
          shouldDelete: true,
          shouldBan: false,
        };
      }
    }

    return { isScam: false, shouldDelete: false, shouldBan: false };
  }

  /**
   * Check for fake contract addresses
   */
  private checkFakeContracts(text: string): ScamCheckResult {
    // Look for patterns that suggest fake contracts
    // E.g., "send to this address", "contract: 0x..."

    const fakeContractPatterns = [
      /send.*to.*(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})/i,
      /contract.*(address)?.*:?.*(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})/i,
      /deposit.*to.*(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})/i,
    ];

    for (const pattern of fakeContractPatterns) {
      if (pattern.test(text)) {
        return {
          isScam: true,
          type: 'contract',
          severity: 'high',
          description: 'Suspicious contract address solicitation',
          shouldDelete: true,
          shouldBan: true,
        };
      }
    }

    return { isScam: false, shouldDelete: false, shouldBan: false };
  }

  /**
   * Add a custom scam pattern
   */
  async addScamPattern(
    pattern: string,
    type: 'url' | 'telegram_link' | 'contract' | 'keyword' | 'unicode',
    severity: 'low' | 'medium' | 'high' | 'critical',
    description?: string
  ): Promise<boolean> {
    try {
      await prisma.scamPattern.create({
        data: {
          pattern,
          type,
          severity,
          description,
        },
      });

      logger.info(`Added scam pattern: ${pattern} (${type}, ${severity})`);
      return true;
    } catch (error) {
      logger.error('Error adding scam pattern:', error);
      return false;
    }
  }

  /**
   * Remove a scam pattern
   */
  async removeScamPattern(patternId: string): Promise<boolean> {
    try {
      await prisma.scamPattern.delete({
        where: { id: patternId },
      });

      logger.info(`Removed scam pattern ${patternId}`);
      return true;
    } catch (error) {
      logger.error('Error removing scam pattern:', error);
      return false;
    }
  }

  /**
   * Toggle scam pattern active status
   */
  async toggleScamPattern(patternId: string): Promise<boolean> {
    try {
      const pattern = await prisma.scamPattern.findUnique({
        where: { id: patternId },
      });

      if (!pattern) {
        return false;
      }

      await prisma.scamPattern.update({
        where: { id: patternId },
        data: { isActive: !pattern.isActive },
      });

      logger.info(`Toggled scam pattern ${patternId} to ${!pattern.isActive ? 'active' : 'inactive'}`);
      return true;
    } catch (error) {
      logger.error('Error toggling scam pattern:', error);
      return false;
    }
  }

  /**
   * Get all active scam patterns
   */
  async getActivePatterns() {
    try {
      return await prisma.scamPattern.findMany({
        where: { isActive: true },
        orderBy: [{ severity: 'desc' }, { type: 'asc' }],
      });
    } catch (error) {
      logger.error('Error getting active patterns:', error);
      return [];
    }
  }

  /**
   * Get scam detection statistics
   */
  async getScamStats() {
    try {
      const patterns = await prisma.scamPattern.findMany();

      const stats = {
        total: patterns.length,
        active: patterns.filter((p) => p.isActive).length,
        byType: {
          url: patterns.filter((p) => p.type === 'url').length,
          telegram_link: patterns.filter((p) => p.type === 'telegram_link').length,
          contract: patterns.filter((p) => p.type === 'contract').length,
          keyword: patterns.filter((p) => p.type === 'keyword').length,
          unicode: patterns.filter((p) => p.type === 'unicode').length,
        },
        bySeverity: {
          low: patterns.filter((p) => p.severity === 'low').length,
          medium: patterns.filter((p) => p.severity === 'medium').length,
          high: patterns.filter((p) => p.severity === 'high').length,
          critical: patterns.filter((p) => p.severity === 'critical').length,
        },
      };

      return stats;
    } catch (error) {
      logger.error('Error getting scam stats:', error);
      return null;
    }
  }
}

export default new ScamBlockerService();
