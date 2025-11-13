/**
 * Utility functions for formatting data in messages
 */

/**
 * Shorten wallet address for display
 */
export function shortenAddress(address: string, chars = 4): string {
  if (!address || address.length <= chars * 2) return address;
  return `${address.substring(0, chars)}...${address.substring(address.length - chars)}`;
}

/**
 * Format number with commas and decimals
 */
export function formatNumber(num: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Format USD amount
 */
export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/**
 * Format large numbers with K, M, B suffixes
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(2);
}

/**
 * Format timestamp to readable date
 */
export function formatTimestamp(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp * 1000) : timestamp;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get explorer URL for transaction
 */
export function getExplorerUrl(chain: string, txHash: string): string {
  const explorers: Record<string, string> = {
    solana: 'https://solscan.io/tx',
    ethereum: 'https://etherscan.io/tx',
    bsc: 'https://bscscan.com/tx',
    polygon: 'https://polygonscan.com/tx',
  };

  const baseUrl = explorers[chain.toLowerCase()] || explorers.ethereum;
  return `${baseUrl}/${txHash}`;
}

/**
 * Get wallet explorer URL
 */
export function getWalletExplorerUrl(chain: string, address: string): string {
  const explorers: Record<string, string> = {
    solana: 'https://solscan.io/account',
    ethereum: 'https://etherscan.io/address',
    bsc: 'https://bscscan.com/address',
    polygon: 'https://polygonscan.com/address',
  };

  const baseUrl = explorers[chain.toLowerCase()] || explorers.ethereum;
  return `${baseUrl}/${address}`;
}

/**
 * Escape special characters for Telegram MarkdownV2
 */
export function escapeMarkdown(text: string): string {
  const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  let escaped = text;

  for (const char of specialChars) {
    escaped = escaped.replace(new RegExp(`\\${char}`, 'g'), `\\${char}`);
  }

  return escaped;
}

/**
 * Sanitize user input to prevent injection
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/[^\w\s@#$.-]/gi, '') // Allow only safe characters
    .trim()
    .substring(0, 200); // Limit length
}

/**
 * Format token amount with proper decimals
 */
export function formatTokenAmount(amount: number, decimals = 18): string {
  const value = amount / Math.pow(10, decimals);
  if (value >= 1000) return formatLargeNumber(value);
  return value.toFixed(4);
}
