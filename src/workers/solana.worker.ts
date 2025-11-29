// @ts-ignore - Solana web3.js types not available
import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import config from '../config';
import logger from '../utils/logger';
import tokenService from '../services/token.service';
import transactionService from '../services/transaction.service';
import priceService from '../services/price.service';
import emojiService from '../services/emoji.service';
import mevService from '../services/mev.service';
import buttonService from '../services/button.service';
import mediaService from '../services/media.service';
import bot from '../bot';
import * as messages from '../templates/messages';

export class SolanaWorker {
  private connection: Connection;
  private isRunning = false;
  private pollingInterval = 5000; // 5 seconds

  constructor() {
    this.connection = new Connection(config.blockchain.solana.rpcUrl, 'confirmed');
  }

  /**
   * Start monitoring Solana transactions
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Solana worker is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Solana worker started');

    // Main monitoring loop
    this.monitorTransactions();
  }

  /**
   * Stop monitoring
   */
  stop() {
    this.isRunning = false;
    logger.info('Solana worker stopped');
  }

  /**
   * Monitor transactions for tracked tokens
   */
  private async monitorTransactions() {
    while (this.isRunning) {
      try {
        // Get all tracked Solana tokens
        const tokens = await tokenService.getActiveTokensByChain('solana');

        for (const token of tokens) {
          try {
            await this.checkTokenTransactions(token);
          } catch (error) {
            logger.error(`Error checking transactions for token ${token.tokenSymbol}:`, error);
          }
        }

        // Wait before next poll
        await this.sleep(this.pollingInterval);
      } catch (error) {
        logger.error('Error in Solana monitoring loop:', error);
        await this.sleep(this.pollingInterval);
      }
    }
  }

  /**
   * Check transactions for a specific token
   */
  private async checkTokenTransactions(token: any) {
    try {
      const tokenPubkey = new PublicKey(token.tokenAddress);

      // Get recent signatures for this token
      const signatures = await this.connection.getSignaturesForAddress(tokenPubkey, {
        limit: 10,
      });

      for (const sigInfo of signatures) {
        try {
          // Check if this transaction was already processed
          const existingTx = await transactionService.getTransactionByHash('solana', sigInfo.signature);
          if (existingTx) {
            // Skip already processed transactions
            continue;
          }

          // Parse the transaction
          const tx = await this.connection.getParsedTransaction(sigInfo.signature, {
            maxSupportedTransactionVersion: 0,
          });

          if (!tx || !tx.meta) continue;

          // Parse swap events from the transaction
          const swapData = await this.parseSwapTransaction(tx, token);

          if (swapData) {
            // Get USD price - pass token amount for accurate pricing
            const priceUsd = await priceService.getTokenPriceUsd(
              token.tokenAddress,
              'solana',
              swapData.amountNative,
              'SOL',
              swapData.amountToken
            );

            // Record transaction
            const transaction = await transactionService.recordTransaction({
              tokenId: token.id,
              txHash: sigInfo.signature,
              chain: 'solana',
              walletAddress: swapData.walletAddress,
              type: swapData.type,
              amountToken: swapData.amountToken,
              amountNative: swapData.amountNative,
              priceUsd: priceUsd,
              timestamp: new Date(sigInfo.blockTime! * 1000),
              blockNumber: BigInt(sigInfo.slot),
            });

            // TEMPORARY: Only alert on BUYS, skip sells
            if (swapData.type === 'sell') {
              logger.debug(`Skipping sell alert for ${token.tokenSymbol} (sell alerts disabled)`);
              continue;
            }

            // Check if above threshold (token amount OR USD value)
            const meetsTokenThreshold = token.minAmount > 0 && swapData.amountToken >= token.minAmount;
            const meetsUsdThreshold = token.minAmountUsd > 0 && priceUsd !== null && priceUsd !== undefined && priceUsd >= token.minAmountUsd;

            // Alert if either threshold is met (or if both are 0, alert everything)
            const shouldAlert =
              (token.minAmount === 0 && token.minAmountUsd === 0) ||
              meetsTokenThreshold ||
              meetsUsdThreshold;

            if (shouldAlert) {
              // Send alert to group
              await this.sendAlert(token, { ...swapData, priceUsd }, sigInfo.signature);
              await transactionService.markAlertSent(transaction.id);
            }
          }
        } catch (error) {
          logger.error(`Error processing signature ${sigInfo.signature}:`, error);
        }
      }
    } catch (error) {
      logger.error(`Error checking token transactions:`, error);
    }
  }

  /**
   * Parse swap transaction data
   * This is a simplified parser - in production, you'd integrate with
   * DEX-specific parsers (Raydium, Orca, Jupiter, etc.)
   */
  private async parseSwapTransaction(
    tx: ParsedTransactionWithMeta,
    token: any
  ): Promise<{
    walletAddress: string;
    type: 'buy' | 'sell';
    amountToken: number;
    amountNative: number;
    priceUsd?: number;
  } | null> {
    try {
      // This is a simplified example
      // In production, you would:
      // 1. Detect which DEX was used (Raydium, Orca, Jupiter, etc.)
      // 2. Parse the specific instruction format
      // 3. Extract token amounts and directions

      if (!tx.meta || !tx.transaction.message) return null;

      const accountKeys = tx.transaction.message.accountKeys;
      if (!accountKeys || accountKeys.length === 0) return null;

      // Get the wallet that initiated the transaction
      const walletAddress = accountKeys[0].pubkey.toString();

      // Look for token balance changes
      const preBalances = tx.meta.preTokenBalances || [];
      const postBalances = tx.meta.postTokenBalances || [];

      // Find balance changes for our token
      let tokenChange = 0;
      let tokenAccountIndex = -1;

      for (const post of postBalances) {
        const pre = preBalances.find((p: any) => p.accountIndex === post.accountIndex);

        if (post.mint === token.tokenAddress) {
          const postAmount = parseFloat(post.uiTokenAmount.uiAmountString || '0');
          const preAmount = pre ? parseFloat(pre.uiTokenAmount.uiAmountString || '0') : 0;
          tokenChange = postAmount - preAmount;
          tokenAccountIndex = post.accountIndex;
          break;
        }
      }

      if (tokenChange === 0) return null;

      // Determine if it's a buy or sell
      const type = tokenChange > 0 ? 'buy' : 'sell';

      // Calculate SOL change based on the swap direction
      // For buys: User spent SOL, so SOL balance decreased
      // For sells: User received SOL, so SOL balance increased
      let solChange = 0;

      if (tx.meta.preBalances && tx.meta.postBalances) {
        // Find the largest SOL balance change (this is likely the swap amount)
        // Exclude index 0 (fee payer) and look for the actual swap amounts
        let maxSolChange = 0;

        for (let i = 0; i < tx.meta.preBalances.length; i++) {
          const change = Math.abs(
            (tx.meta.postBalances[i] - tx.meta.preBalances[i]) / 1_000_000_000
          );
          // Ignore tiny changes (< 0.0001 SOL) which are likely fees
          if (change > 0.0001 && change > maxSolChange) {
            maxSolChange = change;
            solChange = change;
          }
        }

        // If no significant SOL change found, try to estimate from token value
        // This is a fallback for wrapped SOL or complex swaps
        if (solChange === 0) {
          // Use a rough estimate: Check total lamports sent in instructions
          const totalChange = Math.abs(
            (tx.meta.postBalances[0] - tx.meta.preBalances[0]) / 1_000_000_000
          );
          solChange = totalChange > 0.0001 ? totalChange : 0.01; // Minimum 0.01 SOL
        }
      }

      logger.debug(
        `Solana swap parsed: ${Math.abs(tokenChange)} ${token.tokenSymbol} ↔ ${solChange} SOL (${type})`
      );

      return {
        walletAddress,
        type,
        amountToken: Math.abs(tokenChange),
        amountNative: solChange,
        priceUsd: undefined, // Will be calculated by price service
      };
    } catch (error) {
      logger.error('Error parsing swap transaction:', error);
      return null;
    }
  }

  /**
   * Send alert to Telegram group
   */
  private async sendAlert(
    token: any,
    swapData: {
      walletAddress: string;
      type: 'buy' | 'sell';
      amountToken: number;
      amountNative: number;
      priceUsd?: number;
    },
    txHash: string
  ) {
    try {
      // Check MEV blacklist
      const isBlacklisted = await mevService.isBlacklisted(swapData.walletAddress, 'solana');
      if (isBlacklisted) {
        logger.debug(`Skipping alert for blacklisted wallet: ${swapData.walletAddress}`);
        return;
      }

      const priceUsd = swapData.priceUsd || 0;

      // Get emoji for this transaction
      const emoji = await emojiService.getEmojiForValue(token.id, priceUsd);

      // Check if whale
      const isWhale = token.whaleThresholdUsd > 0 && priceUsd >= token.whaleThresholdUsd;

      // Get custom buttons
      const customButtons = await buttonService.getCustomButtons(token.id);
      const replyMarkup = buttonService.formatTelegramButtons(customButtons);

      // Get custom media
      const media = await mediaService.getMedia(token.id);

      // Get market cap
      const marketCap = await priceService.getTokenMarketCap(token.tokenAddress, 'solana');

      const messageData = {
        tokenSymbol: token.tokenSymbol,
        walletAddress: swapData.walletAddress,
        amountToken: swapData.amountToken,
        amountNative: swapData.amountNative,
        nativeSymbol: 'SOL',
        priceUsd: swapData.priceUsd,
        txHash,
        chain: 'solana',
        timestamp: new Date(),
        emoji: swapData.type === 'buy' ? emoji : undefined,
        isWhale: swapData.type === 'buy' ? isWhale : undefined,
        marketCap: swapData.type === 'buy' ? marketCap : undefined,
        tokenAddress: token.tokenAddress,
      };

      const message =
        swapData.type === 'buy'
          ? messages.buyAlert(messageData as any)
          : messages.sellAlert(messageData);

      // Send with media if available
      if (media && swapData.type === 'buy') {
        if (media.type === 'gif') {
          await bot.telegram.sendAnimation(
            Number(token.group.telegramId),
            media.url,
            {
              caption: message,
              parse_mode: 'Markdown',
              reply_markup: replyMarkup,
              disable_web_page_preview: true,
            }
          );
        } else if (media.type === 'image') {
          await bot.telegram.sendPhoto(
            Number(token.group.telegramId),
            media.url,
            {
              caption: message,
              parse_mode: 'Markdown',
              reply_markup: replyMarkup,
              disable_web_page_preview: true,
            }
          );
        } else if (media.type === 'video') {
          await bot.telegram.sendVideo(
            Number(token.group.telegramId),
            media.url,
            {
              caption: message,
              parse_mode: 'Markdown',
              reply_markup: replyMarkup,
              disable_web_page_preview: true,
            }
          );
        }
      } else {
        // Send regular message
        await bot.telegram.sendMessage(Number(token.group.telegramId), message, {
          parse_mode: 'Markdown',
          reply_markup: replyMarkup,
          disable_web_page_preview: true,
        });
      }

      logger.info(
        `Alert sent for ${swapData.type} of ${token.tokenSymbol} in group ${token.group.telegramId}${
          isWhale ? ' [WHALE]' : ''
        }`
      );
    } catch (error: any) {
      // Handle bot kicked from group
      if (error?.response?.error_code === 403) {
        logger.warn(
          `Bot was kicked from group ${token.group.telegramId}. Stopping monitoring for this token.`,
          { tokenId: token.id, groupId: token.group.telegramId }
        );
        // You could add logic here to mark the token as inactive or remove it
        // For now, just log and continue
      } else {
        logger.error('Error sending alert:', error);
      }
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default new SolanaWorker();
