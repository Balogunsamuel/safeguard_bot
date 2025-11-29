import { ethers } from 'ethers';
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

// Note: These constants are reserved for future use with advanced swap detection
// const SWAP_EVENT_SIGNATURE = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
// const ERC20_ABI = [
//   'event Transfer(address indexed from, address indexed to, uint256 value)',
//   'function decimals() view returns (uint8)',
//   'function symbol() view returns (string)',
// ];

// Uniswap V2 Pair ABI
const PAIR_ABI = [
  'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
];

export class EVMWorker {
  private providers: Map<string, ethers.WebSocketProvider> = new Map();
  private isRunning = false;

  constructor() {
    this.initializeProviders();
  }

  /**
   * Initialize WebSocket providers for different chains
   */
  private initializeProviders() {
    try {
      // Ethereum
      if (config.blockchain.ethereum.wsUrl) {
        const ethProvider = new ethers.WebSocketProvider(config.blockchain.ethereum.wsUrl);

        // Add error handler to prevent uncaught exceptions
        ethProvider.on('error', (error) => {
          logger.error('Ethereum WebSocket error:', error);
        });

        this.providers.set('ethereum', ethProvider);
      }

      // BSC
      if (config.blockchain.bsc.wsUrl) {
        const bscProvider = new ethers.WebSocketProvider(config.blockchain.bsc.wsUrl);

        // Add error handler to prevent uncaught exceptions
        bscProvider.on('error', (error) => {
          logger.error('BSC WebSocket error:', error);
        });

        this.providers.set('bsc', bscProvider);
      }
    } catch (error) {
      logger.error('Error initializing EVM providers:', error);
    }
  }

  /**
   * Start monitoring EVM transactions
   */
  async start() {
    if (this.isRunning) {
      logger.warn('EVM worker is already running');
      return;
    }

    this.isRunning = true;
    logger.info('EVM worker started');

    // Monitor each chain
    for (const [chain, provider] of this.providers) {
      this.monitorChain(chain, provider);
    }
  }

  /**
   * Stop monitoring
   */
  async stop() {
    this.isRunning = false;

    // Close all providers
    for (const provider of this.providers.values()) {
      await provider.destroy();
    }

    logger.info('EVM worker stopped');
  }

  /**
   * Monitor a specific chain
   */
  private async monitorChain(chain: string, provider: ethers.WebSocketProvider) {
    try {
      // Get tracked tokens for this chain
      const tokens = await tokenService.getActiveTokensByChain(chain);

      for (const token of tokens) {
        if (!token.pairAddress) {
          logger.warn(`No pair address for token ${token.tokenSymbol} on ${chain}`);
          continue;
        }

        try {
          // Create contract instance for the pair
          const pairContract = new ethers.Contract(token.pairAddress, PAIR_ABI, provider);

          // Listen to Swap events
          pairContract.on('Swap', async (sender, amount0In, amount1In, amount0Out, amount1Out, to, event) => {
            try {
              await this.handleSwapEvent(
                {
                  sender,
                  amount0In,
                  amount1In,
                  amount0Out,
                  amount1Out,
                  to,
                  event,
                },
                token,
                chain,
                provider
              );
            } catch (error) {
              logger.error(`Error handling swap event for ${token.tokenSymbol}:`, error);
            }
          });

          logger.info(`Listening to swaps for ${token.tokenSymbol} on ${chain}`);
        } catch (error) {
          logger.error(`Error setting up listener for ${token.tokenSymbol}:`, error);
        }
      }

      // Periodically refresh tracked tokens
      setInterval(async () => {
        if (!this.isRunning) return;

        // Remove old listeners and add new ones for any newly added tokens
        // const updatedTokens = await tokenService.getActiveTokensByChain(chain);
        // TODO: In production, implement proper listener management here
      }, 60000); // Check every minute
    } catch (error) {
      logger.error(`Error monitoring chain ${chain}:`, error);
    }
  }

  /**
   * Handle a swap event
   */
  private async handleSwapEvent(
    swapData: {
      sender: string;
      amount0In: bigint;
      amount1In: bigint;
      amount0Out: bigint;
      amount1Out: bigint;
      to: string;
      event: any;
    },
    token: any,
    chain: string,
    provider: ethers.WebSocketProvider
  ) {
    try {
      // Determine which token is token0 and token1
      const pairContract = new ethers.Contract(token.pairAddress, PAIR_ABI, provider);
      const token0Address = await pairContract.token0();
      // const token1Address = await pairContract.token1(); // Reserved for future use

      const isToken0 = token0Address.toLowerCase() === token.tokenAddress.toLowerCase();

      // Determine buy or sell
      let type: 'buy' | 'sell';
      let tokenAmount: bigint;
      let nativeAmount: bigint;

      if (isToken0) {
        // Token is token0
        if (swapData.amount0Out > 0n) {
          // User received token0 = BUY
          type = 'buy';
          tokenAmount = swapData.amount0Out;
          nativeAmount = swapData.amount1In;
        } else {
          // User sent token0 = SELL
          type = 'sell';
          tokenAmount = swapData.amount0In;
          nativeAmount = swapData.amount1Out;
        }
      } else {
        // Token is token1
        if (swapData.amount1Out > 0n) {
          // User received token1 = BUY
          type = 'buy';
          tokenAmount = swapData.amount1Out;
          nativeAmount = swapData.amount0In;
        } else {
          // User sent token1 = SELL
          type = 'sell';
          tokenAmount = swapData.amount1In;
          nativeAmount = swapData.amount0Out;
        }
      }

      // Convert amounts from wei
      const tokenAmountDecimal = parseFloat(ethers.formatUnits(tokenAmount, 18));
      const nativeAmountDecimal = parseFloat(ethers.formatUnits(nativeAmount, 18));

      // Get transaction details
      const tx = await provider.getTransaction(swapData.event.log.transactionHash);
      if (!tx) return;

      const block = await provider.getBlock(swapData.event.log.blockNumber);
      if (!block) return;

      // Get native symbol
      const nativeSymbol = chain === 'ethereum' ? 'ETH' : 'BNB';

      // Get USD price
      const priceUsd = await priceService.getTokenPriceUsd(
        token.tokenAddress,
        chain,
        nativeAmountDecimal,
        nativeSymbol
      );

      // TEMPORARY: Only alert on BUYS, skip sells
      if (type === 'sell') {
        logger.debug(`Skipping sell alert for ${token.tokenSymbol} (sell alerts disabled)`);
        return;
      }

      // Check if above threshold (token amount OR USD value)
      const meetsTokenThreshold = token.minAmount > 0 && tokenAmountDecimal >= token.minAmount;
      const meetsUsdThreshold = token.minAmountUsd > 0 && priceUsd !== null && priceUsd !== undefined && priceUsd >= token.minAmountUsd;

      // Alert if either threshold is met (or if both are 0, alert everything)
      const shouldAlert =
        (token.minAmount === 0 && token.minAmountUsd === 0) ||
        meetsTokenThreshold ||
        meetsUsdThreshold;

      if (!shouldAlert) return;

      // Record transaction
      const transaction = await transactionService.recordTransaction({
        tokenId: token.id,
        txHash: swapData.event.log.transactionHash,
        chain,
        walletAddress: swapData.to,
        type,
        amountToken: tokenAmountDecimal,
        amountNative: nativeAmountDecimal,
        priceUsd: priceUsd,
        timestamp: new Date(block.timestamp * 1000),
        blockNumber: BigInt(swapData.event.log.blockNumber),
      });

      // Send alert
      await this.sendAlert(
        token,
        {
          walletAddress: swapData.to,
          type,
          amountToken: tokenAmountDecimal,
          amountNative: nativeAmountDecimal,
          priceUsd: priceUsd,
        },
        swapData.event.log.transactionHash,
        chain,
        block.timestamp
      );

      await transactionService.markAlertSent(transaction.id);
    } catch (error) {
      logger.error('Error handling swap event:', error);
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
    txHash: string,
    chain: string,
    timestamp: number
  ) {
    try {
      // Check MEV blacklist
      const isBlacklisted = await mevService.isBlacklisted(swapData.walletAddress, chain);
      if (isBlacklisted) {
        logger.debug(`Skipping alert for blacklisted wallet: ${swapData.walletAddress}`);
        return;
      }

      const nativeSymbol = chain === 'ethereum' ? 'ETH' : 'BNB';
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
      const marketCap = await priceService.getTokenMarketCap(token.tokenAddress, chain);

      const messageData = {
        tokenSymbol: token.tokenSymbol,
        walletAddress: swapData.walletAddress,
        amountToken: swapData.amountToken,
        amountNative: swapData.amountNative,
        nativeSymbol,
        priceUsd: swapData.priceUsd,
        txHash,
        chain,
        timestamp: new Date(timestamp * 1000),
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
}

export default new EVMWorker();
