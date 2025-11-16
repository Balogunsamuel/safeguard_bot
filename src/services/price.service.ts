import axios from 'axios';
import logger from '../utils/logger';

export class PriceService {
  private readonly COINGECKO_API = 'https://api.coingecko.com/api/v3';
  private readonly DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens';

  // Cache prices for 1 minute to avoid rate limits
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 60 * 1000; // 1 minute

  /**
   * Get token price in USD
   * This calculates the USD value of a transaction
   *
   * For Solana: If tokenAmount is provided, uses Jupiter to get token unit price
   * Otherwise falls back to SOL-based calculation
   *
   * For EVM: Uses native token amount (ETH/BNB)
   */
  async getTokenPriceUsd(
    tokenAddress: string,
    chain: string,
    amountNative: number,
    nativeSymbol: string,
    tokenAmount?: number
  ): Promise<number | undefined> {
    try {
      if (chain === 'solana') {
        return await this.getSolanaPriceUsd(tokenAddress, amountNative, tokenAmount);
      } else {
        return await this.getEvmPriceUsd(amountNative, nativeSymbol);
      }
    } catch (error) {
      logger.error('Error fetching token price:', error);
      return undefined;
    }
  }

  /**
   * Get the actual token price per unit in USD
   * This requires DEX price oracles or CoinGecko integration
   */
  async getTokenUnitPrice(
    tokenAddress: string,
    chain: string
  ): Promise<number | undefined> {
    try {
      // Try to get from CoinGecko by contract address
      const platformId = this.getCoingeckoPlatformId(chain);
      if (!platformId) return undefined;

      const response = await axios.get(
        `${this.COINGECKO_API}/simple/token_price/${platformId}?contract_addresses=${tokenAddress}&vs_currencies=usd`,
        { timeout: 5000 }
      );

      const price = response.data?.[tokenAddress.toLowerCase()]?.usd;
      if (price) {
        return price;
      }

      // Fallback: Could integrate with DEX price oracles here
      // For now, return undefined if not found on CoinGecko
      return undefined;
    } catch (error) {
      logger.debug(`Token not found on CoinGecko: ${tokenAddress}`);
      return undefined;
    }
  }

  /**
   * Get CoinGecko platform ID for chain
   */
  private getCoingeckoPlatformId(chain: string): string | undefined {
    const platformMap: { [key: string]: string } = {
      ethereum: 'ethereum',
      bsc: 'binance-smart-chain',
      solana: 'solana',
    };
    return platformMap[chain];
  }

  /**
   * Get Solana token price in USD
   * Uses token unit price for transfers or SOL amount for swaps
   */
  private async getSolanaPriceUsd(
    tokenAddress: string,
    amountSol: number,
    tokenAmount?: number
  ): Promise<number | undefined> {
    try {
      // If we have a token amount, try to get the token's unit price first
      // This is more accurate for transfers and low-value swaps
      if (tokenAmount !== undefined && tokenAmount > 0) {
        const tokenUnitPrice = await this.getDexScreenerTokenPrice(tokenAddress);

        if (tokenUnitPrice) {
          const tokenBasedUsd = tokenAmount * tokenUnitPrice;
          logger.debug(
            `Solana price calc (token-based): ${tokenAmount.toLocaleString()} tokens * $${tokenUnitPrice} = $${tokenBasedUsd.toFixed(2)}`
          );
          return tokenBasedUsd;
        }

        // If DexScreener fails, log and fall through to SOL-based calculation
        logger.debug(`DexScreener price not available for ${tokenAddress}, using SOL-based calculation`);
      }

      // Fallback: Calculate from SOL amount
      const solPrice = await this.getSolPriceUsd();
      if (!solPrice) return undefined;

      const solBasedUsd = amountSol * solPrice;
      logger.debug(`Solana price calc (SOL-based): ${amountSol} SOL * $${solPrice} = $${solBasedUsd.toFixed(2)}`);

      return solBasedUsd;
    } catch (error) {
      logger.error('Error fetching Solana price:', error);
      return undefined;
    }
  }

  /**
   * Get token unit price from DexScreener API
   * Returns the price of 1 token in USD
   */
  private async getDexScreenerTokenPrice(tokenAddress: string): Promise<number | undefined> {
    const cacheKey = `dexscreener_${tokenAddress}`;
    const cached = this.priceCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.price;
    }

    try {
      const response = await axios.get(
        `${this.DEXSCREENER_API}/${tokenAddress}`,
        { timeout: 5000 }
      );

      // DexScreener API response format: { pairs: [{ priceUsd, liquidity, ... }] }
      // Get the first pair (usually the most liquid)
      const pairs = response.data?.pairs;
      if (pairs && pairs.length > 0 && pairs[0].priceUsd) {
        const price = parseFloat(pairs[0].priceUsd);
        this.priceCache.set(cacheKey, { price, timestamp: Date.now() });
        logger.debug(`DexScreener price for ${tokenAddress}: $${price}`);
        return price;
      }

      return undefined;
    } catch (error) {
      logger.debug(`Failed to get DexScreener price for ${tokenAddress}:`, error);
      return undefined;
    }
  }

  /**
   * Get EVM token price (ETH/BNB based)
   */
  private async getEvmPriceUsd(
    amountNative: number,
    nativeSymbol: string
  ): Promise<number | undefined> {
    try {
      let nativePrice: number | undefined;

      if (nativeSymbol === 'ETH') {
        nativePrice = await this.getEthPriceUsd();
      } else if (nativeSymbol === 'BNB') {
        nativePrice = await this.getBnbPriceUsd();
      }

      if (!nativePrice) {
        logger.warn(`Failed to get ${nativeSymbol} price from CoinGecko`);
        return undefined;
      }

      const usdValue = amountNative * nativePrice;
      logger.debug(`Price calc: ${amountNative} ${nativeSymbol} * $${nativePrice} = $${usdValue.toFixed(2)}`);

      return usdValue;
    } catch (error) {
      logger.error('Error fetching EVM price:', error);
      return undefined;
    }
  }

  /**
   * Get SOL price in USD
   */
  private async getSolPriceUsd(): Promise<number | undefined> {
    const cacheKey = 'SOL';
    const cached = this.priceCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.price;
    }

    try {
      const response = await axios.get(
        `${this.COINGECKO_API}/simple/price?ids=solana&vs_currencies=usd`,
        { timeout: 5000 }
      );

      const price = response.data?.solana?.usd;
      if (price) {
        this.priceCache.set(cacheKey, { price, timestamp: Date.now() });
        return price;
      }

      return undefined;
    } catch (error) {
      logger.error('Error fetching SOL price:', error);
      return undefined;
    }
  }

  /**
   * Get ETH price in USD
   */
  private async getEthPriceUsd(): Promise<number | undefined> {
    const cacheKey = 'ETH';
    const cached = this.priceCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.price;
    }

    try {
      const response = await axios.get(
        `${this.COINGECKO_API}/simple/price?ids=ethereum&vs_currencies=usd`,
        { timeout: 5000 }
      );

      const price = response.data?.ethereum?.usd;
      if (price) {
        this.priceCache.set(cacheKey, { price, timestamp: Date.now() });
        return price;
      }

      return undefined;
    } catch (error) {
      logger.error('Error fetching ETH price:', error);
      return undefined;
    }
  }

  /**
   * Get BNB price in USD
   */
  private async getBnbPriceUsd(): Promise<number | undefined> {
    const cacheKey = 'BNB';
    const cached = this.priceCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.price;
    }

    try {
      const response = await axios.get(
        `${this.COINGECKO_API}/simple/price?ids=binancecoin&vs_currencies=usd`,
        { timeout: 5000 }
      );

      const price = response.data?.binancecoin?.usd;
      if (price) {
        this.priceCache.set(cacheKey, { price, timestamp: Date.now() });
        return price;
      }

      return undefined;
    } catch (error) {
      logger.error('Error fetching BNB price:', error);
      return undefined;
    }
  }
}

export default new PriceService();
