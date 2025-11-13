import { ethers } from 'ethers';
import config from '../config';
import logger from '../utils/logger';
import tokenService from '../services/token.service';
import transactionService from '../services/transaction.service';
import bot from '../bot';
import * as messages from '../templates/messages';

// Uniswap V2 Swap event signature
const SWAP_EVENT_SIGNATURE = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';

// Standard ERC20 ABI (Transfer event)
const ERC20_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

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
        const updatedTokens = await tokenService.getActiveTokensByChain(chain);
        // In production, you'd implement proper listener management here
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
      const token1Address = await pairContract.token1();

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

      // Check if above threshold
      if (tokenAmountDecimal < token.minAmount) return;

      // Get transaction details
      const tx = await provider.getTransaction(swapData.event.log.transactionHash);
      if (!tx) return;

      const block = await provider.getBlock(swapData.event.log.blockNumber);
      if (!block) return;

      // Record transaction
      const transaction = await transactionService.recordTransaction({
        tokenId: token.id,
        txHash: swapData.event.log.transactionHash,
        chain,
        walletAddress: swapData.to,
        type,
        amountToken: tokenAmountDecimal,
        amountNative: nativeAmountDecimal,
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
    },
    txHash: string,
    chain: string,
    timestamp: number
  ) {
    try {
      const nativeSymbol = chain === 'ethereum' ? 'ETH' : 'BNB';

      const message =
        swapData.type === 'buy'
          ? messages.buyAlert({
              tokenSymbol: token.tokenSymbol,
              walletAddress: swapData.walletAddress,
              amountToken: swapData.amountToken,
              amountNative: swapData.amountNative,
              nativeSymbol,
              txHash,
              chain,
              timestamp: new Date(timestamp * 1000),
            })
          : messages.sellAlert({
              tokenSymbol: token.tokenSymbol,
              walletAddress: swapData.walletAddress,
              amountToken: swapData.amountToken,
              amountNative: swapData.amountNative,
              nativeSymbol,
              txHash,
              chain,
              timestamp: new Date(timestamp * 1000),
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
}

export default new EVMWorker();
