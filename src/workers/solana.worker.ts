import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import config from '../config';
import logger from '../utils/logger';
import tokenService from '../services/token.service';
import transactionService from '../services/transaction.service';
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
          // Parse the transaction
          const tx = await this.connection.getParsedTransaction(sigInfo.signature, {
            maxSupportedTransactionVersion: 0,
          });

          if (!tx || !tx.meta) continue;

          // Parse swap events from the transaction
          const swapData = await this.parseSwapTransaction(tx, token);

          if (swapData) {
            // Record transaction
            const transaction = await transactionService.recordTransaction({
              tokenId: token.id,
              txHash: sigInfo.signature,
              chain: 'solana',
              walletAddress: swapData.walletAddress,
              type: swapData.type,
              amountToken: swapData.amountToken,
              amountNative: swapData.amountNative,
              priceUsd: swapData.priceUsd,
              timestamp: new Date(sigInfo.blockTime! * 1000),
              blockNumber: BigInt(sigInfo.slot),
            });

            // Check if above threshold
            if (swapData.amountToken >= token.minAmount) {
              // Send alert to group
              await this.sendAlert(token, swapData, sigInfo.signature);
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

      // Example: Look for token balance changes
      const preBalances = tx.meta.preTokenBalances || [];
      const postBalances = tx.meta.postTokenBalances || [];

      // Find balance changes for our token
      let tokenChange = 0;
      let solChange = 0;

      for (const post of postBalances) {
        const pre = preBalances.find((p) => p.accountIndex === post.accountIndex);

        if (post.mint === token.tokenAddress) {
          const postAmount = parseFloat(post.uiTokenAmount.uiAmountString || '0');
          const preAmount = pre ? parseFloat(pre.uiTokenAmount.uiAmountString || '0') : 0;
          tokenChange = postAmount - preAmount;
        }
      }

      // Check SOL balance changes
      if (tx.meta.preBalances && tx.meta.postBalances) {
        solChange =
          (tx.meta.postBalances[0] - tx.meta.preBalances[0]) / 1_000_000_000; // Convert lamports to SOL
      }

      if (tokenChange === 0) return null;

      // Determine if it's a buy or sell
      const type = tokenChange > 0 ? 'buy' : 'sell';

      return {
        walletAddress,
        type,
        amountToken: Math.abs(tokenChange),
        amountNative: Math.abs(solChange),
        priceUsd: undefined, // Would need price oracle integration
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
      const message =
        swapData.type === 'buy'
          ? messages.buyAlert({
              tokenSymbol: token.tokenSymbol,
              walletAddress: swapData.walletAddress,
              amountToken: swapData.amountToken,
              amountNative: swapData.amountNative,
              nativeSymbol: 'SOL',
              priceUsd: swapData.priceUsd,
              txHash,
              chain: 'solana',
              timestamp: new Date(),
            })
          : messages.sellAlert({
              tokenSymbol: token.tokenSymbol,
              walletAddress: swapData.walletAddress,
              amountToken: swapData.amountToken,
              amountNative: swapData.amountNative,
              nativeSymbol: 'SOL',
              priceUsd: swapData.priceUsd,
              txHash,
              chain: 'solana',
              timestamp: new Date(),
            });

      await bot.telegram.sendMessage(Number(token.group.telegramId), message, {
        parse_mode: 'Markdown',
      });

      logger.info(
        `Alert sent for ${swapData.type} of ${token.tokenSymbol} in group ${token.group.telegramId}`
      );
    } catch (error) {
      logger.error('Error sending alert:', error);
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
