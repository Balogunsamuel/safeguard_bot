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
🛡️ **Multi-Chain Buy Bot Activated**

Hello ${groupName}! I'm your advanced token tracker with next-gen features.

**Features:**
✅ Multi-chain support (Ethereum, BSC, Solana)
✅ Real-time buy/sell alerts with USD values
✅ Dynamic emoji system (🐟 → 🐋)
✅ Whale alerts for large buys
✅ MEV bot filtering (auto-blocks spam)
✅ Buy competitions with leaderboards
✅ Custom buttons, media, and branding
✅ Trending tokens tracker

**Getting Started:**
• Users: Type /help to see available commands
• Admins: Type /help to see full admin command list

Let's track some buys! 🚀
`;

/**
 * Welcome message for new members
 */
export const newMemberWelcome = (firstName: string, groupName: string) => `
👋 **Welcome to ${groupName}, ${firstName}!**

We're excited to have you here! This group is powered by our advanced Multi-Chain Buy Bot.

**What you can do:**
📊 Track real-time buy/sell alerts
🔥 View trending tokens with \`/trending\`
🏆 Check competition leaderboards with \`/competition leaderboard\`
📋 See tracked tokens with \`/listtokens\`
💡 Get help anytime with \`/help\`

**What makes us special:**
✅ Multi-chain support (Ethereum, BSC, Solana)
✅ Dynamic emoji system (🐟 → 🐋)
✅ Whale alerts for big buys
✅ MEV bot filtering (no spam!)
✅ Buy competitions with prizes

Let's get started! 🚀
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
  emoji?: string;
  isWhale?: boolean;
  marketCap?: number;
}) => {
  const emojiPrefix = data.emoji || '💰';
  const whaleIndicator = data.isWhale ? '🐋 **WHALE ALERT** 🐋\n\n' : '';

  return `
${whaleIndicator}${emojiPrefix} **New Buy Alert!**

**Token:** $${data.tokenSymbol}
**Amount:** ${formatNumber(data.amountToken, 4)} ${data.tokenSymbol}
**Value:** ${formatNumber(data.amountNative, 4)} ${data.nativeSymbol}${
    data.priceUsd ? ` (~${formatUSD(data.priceUsd)})` : ''
  }${data.marketCap ? `\n**Market Cap:** ${formatUSD(data.marketCap)}` : ''}
**Wallet:** \`${shortenAddress(data.walletAddress)}\`
**Time:** ${formatTimestamp(data.timestamp)}

[View TX](${getExplorerUrl(data.chain, data.txHash)})
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
  emoji?: string;
}) => {
  const emojiPrefix = data.emoji || '📉';

  return `
${emojiPrefix} **New Sell Alert**

**Token:** $${data.tokenSymbol}
**Amount:** ${formatNumber(data.amountToken, 4)} ${data.tokenSymbol}
**Value:** ${formatNumber(data.amountNative, 4)} ${data.nativeSymbol}${
    data.priceUsd ? ` (~${formatUSD(data.priceUsd)})` : ''
  }
**Wallet:** \`${shortenAddress(data.walletAddress)}\`
**Time:** ${formatTimestamp(data.timestamp)}

[View TX](${getExplorerUrl(data.chain, data.txHash)})
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
🛡️ **Multi-Chain Buy Bot - Help**

**Public Commands:**
\`/start\` - Start the bot
\`/help\` - Show this help message
\`/trending [limit]\` - View trending tokens
\`/competition leaderboard\` - View competition rankings
\`/listtokens\` - List all tracked tokens
\`/groupstats\` - View group statistics

**Features:**
✅ Multi-chain support (Ethereum, BSC, Solana)
✅ Real-time buy/sell alerts with USD values
✅ Dynamic emoji system (🐟 → 🐋)
✅ Whale alerts for large buys
✅ MEV bot filtering (auto-blocks spam)
✅ Buy competitions with leaderboards
✅ Custom buttons, media, and branding
✅ Trending tokens tracker

**Admin Commands:**
Admins can type \`/help\` in a private message for full admin command list.

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

\`/listtokens\` - Show all tracked tokens

**Alert Thresholds:**
\`/setminusd <symbol> <usd_amount>\` - Set minimum USD for alerts
Example: \`/setminusd BONK 50\`

\`/setwhale <symbol> <usd_amount>\` - Set whale alert threshold
Example: \`/setwhale BONK 5000\`

\`/setthreshold <symbol> <amount>\` - Set minimum token amount (legacy)

**Customization:**
\`/setbuttons <symbol> <text> <url> [...]\` - Set all custom buttons at once (max 3)
Example: \`/setbuttons BONK "Buy" https://raydium.io "Chart" https://dexscreener.com\`

\`/addbutton <symbol> <text> <url>\` - Add a single button without replacing existing ones
Example: \`/addbutton BONK "Buy" https://raydium.io\`

\`/clearbuttons <symbol>\` - Remove all custom buttons

\`/setemoji <symbol> [default]\` - Enable dynamic emoji tiers
Example: \`/setemoji BONK default\`

\`/clearemoji <symbol>\` - Disable emoji tiers

\`/setmedia <symbol> <gif|image|video> <url>\` - Add custom media
Example: \`/setmedia BONK gif https://giphy.com/celebrate.gif\`

\`/clearmedia <symbol>\` - Remove custom media

**MEV Bot Blacklist:**
\`/blacklist add <address> [reason]\` - Add wallet to blacklist
\`/blacklist remove <address>\` - Remove from blacklist
\`/blacklist list [chain]\` - View blacklist

**Competitions:**
\`/competition start <name> [hours] [prize]\` - Start buy competition
Example: \`/competition start "Weekend Rally" 48 "1 SOL"\`

\`/competition stop\` - End current competition
\`/competition leaderboard [limit]\` - View rankings

**Statistics:**
\`/groupstats\` - Group overview
\`/trending [limit]\` - View trending tokens

**Note:** Only group admins can use admin commands.
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
    minAmountUsd: number;
  }>
) => {
  if (tokens.length === 0) {
    return '📋 **Tracked Tokens**\n\nNo tokens are currently being tracked.\n\nUse /addtoken to start tracking.';
  }

  let message = '📋 **Tracked Tokens**\n\n';

  tokens.forEach((token, index) => {
    message += `${index + 1}. **$${token.tokenSymbol}** (${token.chain.toUpperCase()})\n`;
    message += `   Address: \`${shortenAddress(token.tokenAddress, 6)}\`\n`;

    if (token.minAmountUsd > 0) {
      message += `   Min Alert: $${token.minAmountUsd.toFixed(2)} USD\n\n`;
    } else if (token.minAmount > 0) {
      message += `   Min Alert: ${formatLargeNumber(token.minAmount)} tokens\n\n`;
    } else {
      message += `   Min Alert: Not set (all transactions)\n\n`;
    }
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
