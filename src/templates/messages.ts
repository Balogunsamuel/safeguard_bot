import {
  formatUSD,
  formatNumber,
  shortenAddress,
  getExplorerUrl,
  formatTimestamp,
  formatLargeNumber,
} from '../utils/formatters';

/**
 * Welcome message when bot is added to a group
 */
export const welcomeMessage = (groupName: string) => `
🛡️ **Safeguard Bot Activated**

Hello ${groupName}! I'm here to protect your community and track token activity.

**Features:**
✅ User verification system
📊 Real-time buy/sell tracking
📈 Trading analytics
🔔 Custom alerts

**Getting Started:**
Admins can use /help to see all available commands.

Let's keep this community safe! 🚀
`;

/**
 * Verification prompt for new members
 */
export const verificationPrompt = (firstName: string) => `
👋 Welcome, ${firstName}!

To join this group, please verify you're a real person by clicking the button below.

This is a one-time verification to protect against bots and spam.
`;

/**
 * Verification success message
 */
export const verificationSuccess = () => `
✅ **Verification Successful!**

You're now verified in this group. Welcome aboard! 🎉
`;

/**
 * Buy transaction alert
 */
export const buyAlert = (data: {
  tokenSymbol: string;
  walletAddress: string;
  amountToken: number;
  amountNative: number;
  nativeSymbol: string;
  priceUsd?: number;
  txHash: string;
  chain: string;
  timestamp: Date;
}) => {
  const explorerUrl = getExplorerUrl(data.chain, data.txHash);

  return `
💰 **New Buy Alert!**

**Token:** $${data.tokenSymbol}
**Amount:** ${formatNumber(data.amountToken, 4)} ${data.tokenSymbol}
**Value:** ${formatNumber(data.amountNative, 4)} ${data.nativeSymbol}${
    data.priceUsd ? ` (~${formatUSD(data.priceUsd)})` : ''
  }
**Wallet:** \`${shortenAddress(data.walletAddress)}\`
**Time:** ${formatTimestamp(data.timestamp)}

🔗 [View Transaction](${explorerUrl})
`;
};

/**
 * Sell transaction alert
 */
export const sellAlert = (data: {
  tokenSymbol: string;
  walletAddress: string;
  amountToken: number;
  amountNative: number;
  nativeSymbol: string;
  priceUsd?: number;
  txHash: string;
  chain: string;
  timestamp: Date;
}) => {
  const explorerUrl = getExplorerUrl(data.chain, data.txHash);

  return `
📉 **New Sell Alert**

**Token:** $${data.tokenSymbol}
**Amount:** ${formatNumber(data.amountToken, 4)} ${data.tokenSymbol}
**Value:** ${formatNumber(data.amountNative, 4)} ${data.nativeSymbol}${
    data.priceUsd ? ` (~${formatUSD(data.priceUsd)})` : ''
  }
**Wallet:** \`${shortenAddress(data.walletAddress)}\`
**Time:** ${formatTimestamp(data.timestamp)}

🔗 [View Transaction](${explorerUrl})
`;
};

/**
 * Daily stats summary
 */
export const dailyStatsMessage = (data: {
  tokenSymbol: string;
  buyCount: number;
  sellCount: number;
  volumeUsd: number;
  uniqueBuyers: number;
  uniqueSellers: number;
}) => `
📊 **24h Statistics - $${data.tokenSymbol}**

**Buys:** ${data.buyCount} (${data.uniqueBuyers} unique wallets)
**Sells:** ${data.sellCount} (${data.uniqueSellers} unique wallets)
**Volume:** ${formatUSD(data.volumeUsd)}
**Net Flow:** ${data.buyCount - data.sellCount > 0 ? '🟢' : '🔴'} ${Math.abs(
  data.buyCount - data.sellCount
)}

Keep up the momentum! 🚀
`;

/**
 * Token added confirmation
 */
export const tokenAddedMessage = (data: {
  tokenSymbol: string;
  tokenAddress: string;
  chain: string;
  minAmount: number;
}) => `
✅ **Token Added for Tracking**

**Symbol:** $${data.tokenSymbol}
**Chain:** ${data.chain.toUpperCase()}
**Address:** \`${data.tokenAddress}\`
**Min Alert Amount:** ${data.minAmount} tokens

I'll notify the group of all trades above the minimum threshold.
`;

/**
 * Token removed confirmation
 */
export const tokenRemovedMessage = (tokenSymbol: string) => `
🗑️ **Token Removed**

$${tokenSymbol} is no longer being tracked.
`;

/**
 * Help message for users
 */
export const helpMessage = () => `
🛡️ **Safeguard Bot - Help**

**User Commands:**
/start - Start the bot
/help - Show this help message
/stats - View group statistics

**Admin Commands:**
/addtoken - Add a token to track
/removetoken - Remove a tracked token
/listTokens - List all tracked tokens
/setThreshold - Set minimum alert amount
/dailystats - View 24h statistics

**Need Support?**
Contact the group admins for assistance.
`;

/**
 * Admin help message
 */
export const adminHelpMessage = () => `
🔧 **Admin Commands**

**Token Management:**
\`/addtoken <chain> <address> <symbol> [name]\`
Example: \`/addtoken solana EPjFWdd5A...xyYm USDC USD Coin\`

\`/removetoken <symbol>\`
Example: \`/removetoken USDC\`

\`/setthreshold <symbol> <amount>\`
Example: \`/setthreshold PEPE 1000000\`

\`/listtokens\` - Show all tracked tokens

**Statistics:**
\`/dailystats <symbol>\` - 24h stats for a token
\`/groupstats\` - Group overview

**Note:** Only group admins can use these commands.
`;

/**
 * Token list message
 */
export const tokenListMessage = (
  tokens: Array<{
    tokenSymbol: string;
    tokenAddress: string;
    chain: string;
    minAmount: number;
  }>
) => {
  if (tokens.length === 0) {
    return '📋 **Tracked Tokens**\n\nNo tokens are currently being tracked.\n\nUse /addtoken to start tracking.';
  }

  let message = '📋 **Tracked Tokens**\n\n';

  tokens.forEach((token, index) => {
    message += `${index + 1}. **$${token.tokenSymbol}** (${token.chain.toUpperCase()})\n`;
    message += `   Address: \`${shortenAddress(token.tokenAddress, 6)}\`\n`;
    message += `   Min Alert: ${formatLargeNumber(token.minAmount)} tokens\n\n`;
  });

  return message;
};

/**
 * Group stats message
 */
export const groupStatsMessage = (data: {
  groupName: string;
  verifiedUsers: number;
  trackedTokens: number;
  totalTransactions: number;
}) => `
📊 **Group Statistics**

**Group:** ${data.groupName}
**Verified Members:** ${data.verifiedUsers}
**Tracked Tokens:** ${data.trackedTokens}
**Total Transactions Tracked:** ${data.totalTransactions}

Bot Status: 🟢 Active
`;

/**
 * Error message
 */
export const errorMessage = (error: string) => `
❌ **Error**

${error}

Please try again or contact support if the issue persists.
`;

/**
 * Unauthorized message
 */
export const unauthorizedMessage = () => `
🚫 **Unauthorized**

This command is only available to group administrators.
`;

/**
 * Rate limit message
 */
export const rateLimitMessage = () => `
⏱️ **Rate Limit Exceeded**

Please wait a moment before trying again.
`;
