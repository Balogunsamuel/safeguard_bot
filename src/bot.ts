import { Telegraf, Context, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import { ethers } from 'ethers';
import config from './config';
import logger from './utils/logger';
import { connectDatabase } from './utils/database';
import { connectRedis, CacheService } from './utils/redis';
import prisma from './utils/database';
import userService from './services/user.service';
import groupService from './services/group.service';
import tokenService from './services/token.service';
import buttonService from './services/button.service';
import emojiService from './services/emoji.service';
import mediaService from './services/media.service';
import mevService from './services/mev.service';
import competitionService from './services/competition.service';
import trendingService from './services/trending.service';
import * as messages from './templates/messages';
import { sanitizeInput } from './utils/formatters';

// Portal system imports
import {
  scamBlockerService,
  verificationService,
  portalService,
  antiRaidService,
  conversationService,
} from './services';
import * as portalHandlers from './handlers/portal.handlers';
import * as portalEvents from './handlers/portal.events';
import * as setupWizard from './handlers/setup.wizard';
import * as startHandler from './handlers/start.handler';
import helpHandler from './handlers/help.handler';

// Initialize bot
const bot = new Telegraf(config.telegram.token);

// Initialize cache
const cache = new CacheService();

/**
 * Rate limiting middleware
 */
bot.use(async (ctx, next) => {
  if (!ctx.from) return next();

  const key = `ratelimit:${ctx.from.id}`;
  const count = await cache.incr(key);

  if (count === 1) {
    await cache.expire(key, 60); // 1 minute window
  }

  if (count > config.rateLimit.maxRequests) {
    return ctx.reply(messages.rateLimitMessage());
  }

  return next();
});

/**
 * Check if user is admin in chat
 */
async function isAdmin(ctx: Context): Promise<boolean> {
  if (!ctx.chat || !ctx.from) return false;

  try {
    // Check if user is in admin list from config
    if (config.admin.userIds.includes(ctx.from.id)) {
      return true;
    }

    // Check if user is admin in the chat
    if (ctx.chat.type === 'private') return true;

    const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
    return member.status === 'creator' || member.status === 'administrator';
  } catch (error) {
    logger.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * Get Uniswap V2 pair address for a token
 */
async function getPairAddress(chain: string, tokenAddress: string): Promise<string | null> {
  try {
    // Factory addresses for different chains
    const FACTORY_ADDRESSES: { [key: string]: string } = {
      ethereum: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', // Uniswap V2
      bsc: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73', // PancakeSwap V2
    };

    // WETH/WBNB addresses
    const WRAPPED_NATIVE: { [key: string]: string } = {
      ethereum: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      bsc: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    };

    const factoryAddress = FACTORY_ADDRESSES[chain.toLowerCase()];
    const wrappedNative = WRAPPED_NATIVE[chain.toLowerCase()];

    if (!factoryAddress || !wrappedNative) {
      logger.warn(`Chain ${chain} not supported for automatic pair detection`);
      return null;
    }

    // Get provider
    let rpcUrl: string | undefined;
    if (chain.toLowerCase() === 'ethereum') {
      rpcUrl = config.blockchain.ethereum.rpcUrl;
    } else if (chain.toLowerCase() === 'bsc') {
      rpcUrl = config.blockchain.bsc.rpcUrl;
    }

    if (!rpcUrl) {
      logger.warn(`No RPC URL configured for ${chain}`);
      return null;
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Uniswap V2 Factory ABI (just the getPair function)
    const factoryAbi = ['function getPair(address tokenA, address tokenB) view returns (address pair)'];
    const factory = new ethers.Contract(factoryAddress, factoryAbi, provider);

    // Get pair address
    const pairAddress = await factory.getPair(tokenAddress, wrappedNative);

    // Check if pair exists (non-zero address)
    if (pairAddress === '0x0000000000000000000000000000000000000000') {
      logger.warn(`No pair found for token ${tokenAddress} on ${chain}`);
      return null;
    }

    logger.info(`Found pair address ${pairAddress} for token ${tokenAddress} on ${chain}`);
    return pairAddress;
  } catch (error) {
    logger.error('Error fetching pair address:', error);
    return null;
  }
}

/**
 * Start command - New Safeguard-style with interactive menu
 */
bot.command('start', startHandler.handleStartCommand);

/**
 * Help command
 */
bot.command('help', async (ctx) => {
  try {
    const isAdminUser = await isAdmin(ctx);
    if (isAdminUser) {
      await ctx.reply(messages.adminHelpMessage(), {
        parse_mode: 'Markdown',
        reply_markup: messages.adminHelpKeyboard(),
      });
    } else {
      await ctx.reply(messages.helpMessage(), { parse_mode: 'Markdown' });
    }
  } catch (error) {
    logger.error('Error in help command:', error);
  }
});

/**
 * New member handler - send welcome message and verification prompt
 */
bot.on(message('new_chat_members'), async (ctx) => {
  try {
    const newMembers = ctx.message.new_chat_members;
    const groupName = 'title' in ctx.chat ? ctx.chat.title : 'this group';

    for (const member of newMembers) {
      // Skip bots
      if (member.is_bot) continue;

      // Create/update user
      await userService.upsertUser(member);

      // Send welcome message
      await ctx.reply(messages.newMemberWelcome(member.first_name, groupName), {
        parse_mode: 'Markdown',
      });

      // Send verification prompt
      await ctx.reply(messages.verificationPrompt(member.first_name), {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '✅ Verify Me',
                callback_data: `verify:${member.id}`,
              },
            ],
          ],
        },
      });
    }
  } catch (error) {
    logger.error('Error handling new members:', error);
  }
});

/**
 * Verification button callback
 */
bot.action(/verify:(\d+)/, async (ctx) => {
  try {
    const userId = ctx.match[1];

    if (!ctx.from || ctx.from.id.toString() !== userId) {
      return await ctx.answerCbQuery('This verification is not for you!');
    }

    // Get or create user
    let user = await userService.getUserByTelegramId(ctx.from.id);
    if (!user) {
      user = await userService.upsertUser(ctx.from);
    }

    // Get or create group
    if (!ctx.chat || !('title' in ctx.chat)) {
      return await ctx.answerCbQuery('Verification only works in groups!');
    }

    let group = await groupService.getGroupByTelegramId(ctx.chat.id);
    if (!group) {
      group = await groupService.upsertGroup(ctx.chat);
    }

    // Additional null checks for TypeScript
    if (!user || !group) {
      return await ctx.answerCbQuery('Verification failed. Please try again.');
    }

    // Verify user in group
    await groupService.verifyUser(user.id, group.id);

    await ctx.answerCbQuery('✅ Verified successfully!');
    try {
      await ctx.editMessageText(messages.verificationSuccess(), { parse_mode: 'Markdown' });
    } catch (err: any) {
      // Ignore "message is not modified" errors from Telegram
      const desc = err?.description || err?.message || '';
      if (!desc.includes('message is not modified')) {
        throw err;
      }
    }

    logger.info(`User ${ctx.from.id} verified in group ${ctx.chat.id}`);
  } catch (error) {
    logger.error('Error in verification callback:', error);
    await ctx.answerCbQuery('Verification failed. Please try again.');
  }
  return;
});

/**
 * Add token command (Admin only)
 * Usage: /addtoken <chain> <address> <symbol> [name]
 */
bot.command('addtoken', async (ctx) => {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply(messages.unauthorizedMessage());
    }

    if (!ctx.chat || !('title' in ctx.chat)) {
      return ctx.reply('This command only works in groups!');
    }

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 3) {
      return ctx.reply(
        'Usage: /addtoken <chain> <address> <symbol> [name]\n' +
          'Example: /addtoken solana EPjFWdd5A...xyYm USDC "USD Coin"'
      );
    }

    const [chain, address, symbol, ...nameParts] = args;
    const name = nameParts.join(' ') || undefined;

    // Get group
    let group = await groupService.getGroupByTelegramId(ctx.chat.id);
    if (!group) {
      group = await groupService.upsertGroup(ctx.chat);
    }

    // For EVM chains, try to fetch the pair address automatically
    let pairAddress: string | undefined;
    const normalizedChain = chain.toLowerCase();
    if (normalizedChain === 'ethereum' || normalizedChain === 'bsc' || normalizedChain === 'eth') {
      const statusMsg = await ctx.reply('🔍 Fetching pair address...');
      pairAddress = await getPairAddress(normalizedChain === 'eth' ? 'ethereum' : normalizedChain, address) || undefined;

      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
      } catch (err) {
        // Ignore error if we can't delete the message
      }

      if (!pairAddress) {
        await ctx.reply(
          '⚠️ Warning: Could not find pair address automatically.\n' +
          'The token has been added, but buy alerts may not work until a pair address is set.\n\n' +
          'You can manually update it later if needed.',
          { parse_mode: 'Markdown' }
        );
      }
    }

    // Add token
    const token = await tokenService.addTrackedToken({
      groupId: group.id,
      chain: sanitizeInput(chain),
      tokenAddress: sanitizeInput(address),
      tokenSymbol: sanitizeInput(symbol),
      tokenName: name ? sanitizeInput(name) : undefined,
      pairAddress,
      minAmount: 0,
    });

    await ctx.reply(
      messages.tokenAddedMessage({
        tokenSymbol: token.tokenSymbol,
        tokenAddress: token.tokenAddress,
        chain: token.chain,
        minAmount: token.minAmount,
      }),
      { parse_mode: 'Markdown' }
    );

    logger.info(`Token ${symbol} added to group ${ctx.chat.id}${pairAddress ? ` with pair ${pairAddress}` : ' (no pair address)'}`);
  } catch (error) {
    logger.error('Error in addtoken command:', error);
    await ctx.reply(messages.errorMessage('Failed to add token.'));
  }
});

/**
 * Remove token command (Admin only)
 * Usage: /removetoken <symbol>
 */
bot.command('removetoken', async (ctx) => {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply(messages.unauthorizedMessage());
    }

    if (!ctx.chat || !('title' in ctx.chat)) {
      return ctx.reply('This command only works in groups!');
    }

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
      return ctx.reply('Usage: /removetoken <symbol>\nExample: /removetoken USDC');
    }

    const symbol = sanitizeInput(args[0]);

    const group = await groupService.getGroupByTelegramId(ctx.chat.id);
    if (!group) {
      return ctx.reply('Group not found!');
    }

    const tokens = await tokenService.getGroupTokens(group.id);
    const token = tokens.find((t) => t.tokenSymbol.toLowerCase() === symbol.toLowerCase());

    if (!token) {
      return ctx.reply(`Token ${symbol} not found in tracked list.`);
    }

    await tokenService.removeTrackedToken(token.id);
    await ctx.reply(messages.tokenRemovedMessage(symbol), { parse_mode: 'Markdown' });

    logger.info(`Token ${symbol} removed from group ${ctx.chat.id}`);
  } catch (error) {
    logger.error('Error in removetoken command:', error);
    await ctx.reply(messages.errorMessage('Failed to remove token.'));
  }
});

/**
 * List tokens command
 */
bot.command('listtokens', async (ctx) => {
  try {
    if (!ctx.chat || !('title' in ctx.chat)) {
      return ctx.reply('This command only works in groups!');
    }

    const group = await groupService.getGroupByTelegramId(ctx.chat.id);
    if (!group) {
      return ctx.reply('Group not found!');
    }

    const tokens = await tokenService.getGroupTokens(group.id);
    await ctx.reply(messages.tokenListMessage(tokens), { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('Error in listtokens command:', error);
    await ctx.reply(messages.errorMessage('Failed to fetch tokens.'));
  }
});

/**
 * Set threshold command (Admin only)
 * Usage: /setthreshold <symbol> <amount>
 */
bot.command('setthreshold', async (ctx) => {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply(messages.unauthorizedMessage());
    }

    if (!ctx.chat || !('title' in ctx.chat)) {
      return ctx.reply('This command only works in groups!');
    }

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) {
      return ctx.reply(
        'Usage: /setthreshold <symbol> <amount>\nExample: /setthreshold PEPE 1000000'
      );
    }

    const [symbol, amountStr] = args;
    const amount = parseFloat(amountStr);

    if (isNaN(amount) || amount < 0) {
      return ctx.reply('Invalid amount. Please provide a positive number.');
    }

    const group = await groupService.getGroupByTelegramId(ctx.chat.id);
    if (!group) {
      return ctx.reply('Group not found!');
    }

    const tokens = await tokenService.getGroupTokens(group.id);
    const token = tokens.find((t) => t.tokenSymbol.toLowerCase() === symbol.toLowerCase());

    if (!token) {
      return ctx.reply(`Token ${symbol} not found in tracked list.`);
    }

    await tokenService.updateMinAmount(token.id, amount);
    await ctx.reply(
      `✅ Updated minimum alert threshold for $${symbol} to ${amount} tokens.`
    );

    logger.info(`Threshold updated for ${symbol} in group ${ctx.chat.id}`);
  } catch (error) {
    logger.error('Error in setthreshold command:', error);
    await ctx.reply(messages.errorMessage('Failed to update threshold.'));
  }
});

/**
 * Set USD threshold command (Admin only)
 * Usage: /setminusd <symbol> <usd_amount>
 */
bot.command('setminusd', async (ctx) => {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply(messages.unauthorizedMessage());
    }

    if (!ctx.chat || !('title' in ctx.chat)) {
      return ctx.reply('This command only works in groups!');
    }

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) {
      return ctx.reply(
        '💵 **Set Minimum Buy Alert in USD**\n\n' +
          'Usage: /setminusd <symbol> <usd_amount>\n' +
          'Example: /setminusd BONK 50\n\n' +
          'This will only alert when a buy transaction is worth $50 or more.',
        { parse_mode: 'Markdown' }
      );
    }

    const [symbol, amountStr] = args;
    const amountUsd = parseFloat(amountStr);

    if (isNaN(amountUsd) || amountUsd < 0) {
      return ctx.reply('❌ Invalid amount. Please provide a positive number in USD.');
    }

    const group = await groupService.getGroupByTelegramId(ctx.chat.id);
    if (!group) {
      return ctx.reply('Group not found!');
    }

    const tokens = await tokenService.getGroupTokens(group.id);
    const token = tokens.find((t) => t.tokenSymbol.toLowerCase() === symbol.toLowerCase());

    if (!token) {
      return ctx.reply(`Token ${symbol} not found in tracked list. Use /listtokens to see all tracked tokens.`);
    }

    await tokenService.updateMinAmountUsd(token.id, amountUsd);
    await ctx.reply(
      `✅ **Minimum Alert Threshold Updated**\n\n` +
        `Token: $${symbol}\n` +
        `Minimum USD Value: $${amountUsd.toFixed(2)}\n\n` +
        `You will now only receive alerts when a buy transaction is worth $${amountUsd.toFixed(2)} or more.`,
      { parse_mode: 'Markdown' }
    );

    logger.info(`USD threshold updated for ${symbol} to $${amountUsd} in group ${ctx.chat.id}`);
  } catch (error) {
    logger.error('Error in setminusd command:', error);
    await ctx.reply(messages.errorMessage('Failed to update USD threshold.'));
  }
});

/**
 * Group stats command
 */
bot.command('groupstats', async (ctx) => {
  try {
    if (!ctx.chat || !('title' in ctx.chat)) {
      return ctx.reply('This command only works in groups!');
    }

    const group = await groupService.getGroupByTelegramId(ctx.chat.id);
    if (!group) {
      return ctx.reply('Group not found!');
    }

    const verifiedCount = await groupService.getGroupVerifiedCount(group.id);
    const tokens = await tokenService.getGroupTokens(group.id);

    // Get total transactions count (simplified)
    const totalTx = 0; // Would need to aggregate from all tokens

    await ctx.reply(
      messages.groupStatsMessage({
        groupName: ctx.chat.title,
        verifiedUsers: verifiedCount,
        trackedTokens: tokens.length,
        totalTransactions: totalTx,
      }),
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error in groupstats command:', error);
    await ctx.reply(messages.errorMessage('Failed to fetch stats.'));
  }
});

/**
 * Set custom buttons command (Admin only)
 * Usage: /setbuttons <symbol> <text1> <url1> [<text2> <url2>] [<text3> <url3>]
 */
bot.command('setbuttons', async (ctx) => {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply(messages.unauthorizedMessage());
    }

    if (!ctx.chat || !('title' in ctx.chat)) {
      return ctx.reply('This command only works in groups!');
    }

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 3 || args.length % 2 === 0) {
      return ctx.reply(
        '**Set Custom Buttons**\n\n' +
          'Usage: `/setbuttons <symbol> <text1> <url1> [<text2> <url2>] [<text3> <url3>]`\n\n' +
          'Example: `/setbuttons BONK "Buy Now" https://raydium.io "Chart" https://dexscreener.com`\n\n' +
          'Max 3 buttons allowed.',
        { parse_mode: 'Markdown' }
      );
    }

    const symbol = sanitizeInput(args[0]);
    const group = await groupService.getGroupByTelegramId(ctx.chat.id);
    if (!group) return ctx.reply('Group not found!');

    const tokens = await tokenService.getGroupTokens(group.id);
    const token = tokens.find((t) => t.tokenSymbol.toLowerCase() === symbol.toLowerCase());
    if (!token) return ctx.reply(`Token ${symbol} not found.`);

    // Parse buttons
    const buttons = [];
    for (let i = 1; i < args.length && buttons.length < 3; i += 2) {
      if (i + 1 < args.length) {
        buttons.push({
          text: args[i].replace(/"/g, ''),
          url: args[i + 1].replace(/"/g, ''),
        });
      }
    }

    await buttonService.setCustomButtons(token.id, buttons);
    await ctx.reply(
      `✅ **Custom Buttons Set for $${symbol}**\n\n${buttons.map((b, i) => `${i + 1}. ${b.text}: ${b.url}`).join('\n')}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error in setbuttons command:', error);
    await ctx.reply(messages.errorMessage('Failed to set buttons.'));
  }
});

/**
 * Clear custom buttons command (Admin only)
 */
bot.command('clearbuttons', async (ctx) => {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply(messages.unauthorizedMessage());
    }

    if (!ctx.chat || !('title' in ctx.chat)) {
      return ctx.reply('This command only works in groups!');
    }

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
      return ctx.reply('Usage: `/clearbuttons <symbol>`', { parse_mode: 'Markdown' });
    }

    const symbol = sanitizeInput(args[0]);
    const group = await groupService.getGroupByTelegramId(ctx.chat.id);
    if (!group) return ctx.reply('Group not found!');

    const tokens = await tokenService.getGroupTokens(group.id);
    const token = tokens.find((t) => t.tokenSymbol.toLowerCase() === symbol.toLowerCase());
    if (!token) return ctx.reply(`Token ${symbol} not found.`);

    await buttonService.clearCustomButtons(token.id);
    await ctx.reply(`✅ Custom buttons cleared for $${symbol}`);
  } catch (error) {
    logger.error('Error in clearbuttons command:', error);
    await ctx.reply(messages.errorMessage('Failed to clear buttons.'));
  }
});

/**
 * Add a single button command (Admin only)
 * Usage: /addbutton <symbol> <text> <url>
 */
bot.command('addbutton', async (ctx) => {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply(messages.unauthorizedMessage());
    }

    if (!ctx.chat || !('title' in ctx.chat)) {
      return ctx.reply('This command only works in groups!');
    }

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 3) {
      return ctx.reply(
        '**Add Custom Button**\n\n' +
          'Usage: `/addbutton <symbol> <text> <url>`\n\n' +
          'Example: `/addbutton BONK "Buy Now" https://raydium.io`\n\n' +
          'This adds a button without replacing existing ones.\n' +
          'Max 3 buttons total.',
        { parse_mode: 'Markdown' }
      );
    }

    const symbol = sanitizeInput(args[0]);
    const group = await groupService.getGroupByTelegramId(ctx.chat.id);
    if (!group) return ctx.reply('Group not found!');

    const tokens = await tokenService.getGroupTokens(group.id);
    const token = tokens.find((t) => t.tokenSymbol.toLowerCase() === symbol.toLowerCase());
    if (!token) return ctx.reply(`Token ${symbol} not found.`);

    // Get button text and URL
    const buttonText = args[1].replace(/"/g, '');
    const buttonUrl = args[2].replace(/"/g, '');

    await buttonService.addCustomButton(token.id, {
      text: buttonText,
      url: buttonUrl,
    });

    // Get all buttons to show user
    const allButtons = await buttonService.getCustomButtons(token.id);

    await ctx.reply(
      `✅ **Button Added for $${symbol}**\n\n` +
        `Current Buttons:\n${allButtons.map((b, i) => `${i + 1}. ${b.text}: ${b.url}`).join('\n')}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error in addbutton command:', error);
    await ctx.reply(messages.errorMessage(error instanceof Error ? error.message : 'Failed to add button.'));
  }
});

/**
 * Set emoji tiers command (Admin only)
 */
bot.command('setemoji', async (ctx) => {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply(messages.unauthorizedMessage());
    }

    if (!ctx.chat || !('title' in ctx.chat)) {
      return ctx.reply('This command only works in groups!');
    }

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
      return ctx.reply(
        '**Set Emoji Tiers**\n\n' +
          'Usage: `/setemoji <symbol> [default]`\n\n' +
          'Example: `/setemoji BONK default`\n\n' +
          'This will set default emoji tiers:\n' +
          '🐟 $0-$50 (Small)\n' +
          '🐠 $50-$200 (Medium)\n' +
          '🐬 $200-$1,000 (Large)\n' +
          '🦈 $1,000-$5,000 (Shark)\n' +
          '🐋 $5,000+ (Whale)',
        { parse_mode: 'Markdown' }
      );
    }

    const symbol = sanitizeInput(args[0]);
    const group = await groupService.getGroupByTelegramId(ctx.chat.id);
    if (!group) return ctx.reply('Group not found!');

    const tokens = await tokenService.getGroupTokens(group.id);
    const token = tokens.find((t) => t.tokenSymbol.toLowerCase() === symbol.toLowerCase());
    if (!token) return ctx.reply(`Token ${symbol} not found.`);

    await emojiService.setDefaultTiers(token.id);
    await ctx.reply(
      `✅ **Default Emoji Tiers Set for $${symbol}**\n\n` +
        '🐟 $0-$50 (Small)\n' +
        '🐠 $50-$200 (Medium)\n' +
        '🐬 $200-$1,000 (Large)\n' +
        '🦈 $1,000-$5,000 (Shark)\n' +
        '🐋 $5,000+ (Whale)',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error in setemoji command:', error);
    await ctx.reply(messages.errorMessage('Failed to set emoji tiers.'));
  }
});

/**
 * Set custom media command (Admin only)
 */
bot.command('setmedia', async (ctx) => {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply(messages.unauthorizedMessage());
    }

    if (!ctx.chat || !('title' in ctx.chat)) {
      return ctx.reply('This command only works in groups!');
    }

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 3) {
      return ctx.reply(
        '**Set Custom Media**\n\n' +
          'Usage: `/setmedia <symbol> <gif|image|video> <url>`\n\n' +
          'Example: `/setmedia BONK gif https://example.com/celebration.gif`',
        { parse_mode: 'Markdown' }
      );
    }

    const [symbol, typeStr, url] = args;
    const type = typeStr as 'gif' | 'image' | 'video';

    if (!['gif', 'image', 'video'].includes(type)) {
      return ctx.reply('Invalid media type. Use: gif, image, or video');
    }

    const group = await groupService.getGroupByTelegramId(ctx.chat.id);
    if (!group) return ctx.reply('Group not found!');

    const tokens = await tokenService.getGroupTokens(group.id);
    const token = tokens.find((t) => t.tokenSymbol.toLowerCase() === symbol.toLowerCase());
    if (!token) return ctx.reply(`Token ${symbol} not found.`);

    await mediaService.setMedia(token.id, type, url);
    await ctx.reply(
      `✅ **Custom ${type.toUpperCase()} Set for $${symbol}**\n\nURL: ${url}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error in setmedia command:', error);
    await ctx.reply(messages.errorMessage('Failed to set media.'));
  }
});

/**
 * Set whale threshold command (Admin only)
 */
bot.command('setwhale', async (ctx) => {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply(messages.unauthorizedMessage());
    }

    if (!ctx.chat || !('title' in ctx.chat)) {
      return ctx.reply('This command only works in groups!');
    }

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) {
      return ctx.reply(
        '**Set Whale Threshold**\n\n' +
          'Usage: `/setwhale <symbol> <usd_amount>`\n\n' +
          'Example: `/setwhale BONK 5000`\n\n' +
          'Buys above this USD value will show a special 🐋 whale indicator.',
        { parse_mode: 'Markdown' }
      );
    }

    const [symbol, amountStr] = args;
    const amountUsd = parseFloat(amountStr);

    if (isNaN(amountUsd) || amountUsd < 0) {
      return ctx.reply('Invalid amount. Please provide a positive number.');
    }

    const group = await groupService.getGroupByTelegramId(ctx.chat.id);
    if (!group) return ctx.reply('Group not found!');

    const tokens = await tokenService.getGroupTokens(group.id);
    const token = tokens.find((t) => t.tokenSymbol.toLowerCase() === symbol.toLowerCase());
    if (!token) return ctx.reply(`Token ${symbol} not found.`);

    await prisma.trackedToken.update({
      where: { id: token.id },
      data: { whaleThresholdUsd: amountUsd },
    });

    await ctx.reply(
      `✅ **Whale Threshold Set for $${symbol}**\n\n` +
        `Buys worth $${amountUsd.toFixed(2)} or more will show a 🐋 whale alert!`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error in setwhale command:', error);
    await ctx.reply(messages.errorMessage('Failed to set whale threshold.'));
  }
});

/**
 * MEV Blacklist commands (Admin only)
 */
bot.command('blacklist', async (ctx) => {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply(messages.unauthorizedMessage());
    }

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
      return ctx.reply(
        '**MEV Blacklist Commands**\n\n' +
          '`/blacklist add <address> [reason]` - Add wallet to blacklist\n' +
          '`/blacklist remove <address>` - Remove from blacklist\n' +
          '`/blacklist list [chain]` - View blacklist\n\n' +
          'Blacklisted wallets will not trigger buy alerts.',
        { parse_mode: 'Markdown' }
      );
    }

    const action = args[0].toLowerCase();

    if (action === 'add') {
      if (args.length < 2) {
        return ctx.reply('Usage: `/blacklist add <address> [reason]`', { parse_mode: 'Markdown' });
      }

      const address = args[1];
      const reason = args.slice(2).join(' ') || 'MEV bot';

      await mevService.addToBlacklist(address, 'all', reason, ctx.from?.username);
      await ctx.reply(`✅ Added \`${address}\` to blacklist\nReason: ${reason}`, {
        parse_mode: 'Markdown',
      });
    } else if (action === 'remove') {
      if (args.length < 2) {
        return ctx.reply('Usage: `/blacklist remove <address>`', { parse_mode: 'Markdown' });
      }

      const address = args[1];
      await mevService.removeFromBlacklist(address);
      await ctx.reply(`✅ Removed \`${address}\` from blacklist`, { parse_mode: 'Markdown' });
    } else if (action === 'list') {
      const chain = args[1];
      const list = await mevService.getBlacklist(chain);

      if (list.length === 0) {
        return ctx.reply('Blacklist is empty.');
      }

      const message =
        `**MEV Blacklist** (${list.length} entries)\n\n` +
        list
          .slice(0, 20)
          .map((entry) => `• \`${entry.walletAddress.slice(0, 10)}...\` (${entry.chain})`)
          .join('\n') +
        (list.length > 20 ? `\n\n...and ${list.length - 20} more` : '');

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } else {
      return ctx.reply('Invalid action. Use: add, remove, or list');
    }
  } catch (error) {
    logger.error('Error in blacklist command:', error);
    await ctx.reply(messages.errorMessage('Failed to manage blacklist.'));
  }
});

/**
 * Competition commands (Admin only)
 */
bot.command('competition', async (ctx) => {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply(messages.unauthorizedMessage());
    }

    if (!ctx.chat || !('title' in ctx.chat)) {
      return ctx.reply('This command only works in groups!');
    }

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
      return ctx.reply(
        '**Competition Commands**\n\n' +
          '`/competition start <name> [hours] [prize]` - Start competition\n' +
          '`/competition stop` - End current competition\n' +
          '`/competition leaderboard [limit]` - Show leaderboard\n\n' +
          'Example: `/competition start "Weekend Rally" 48 "1 SOL"`',
        { parse_mode: 'Markdown' }
      );
    }

    const action = args[0].toLowerCase();
    const group = await groupService.getGroupByTelegramId(ctx.chat.id);
    if (!group) return ctx.reply('Group not found!');

    if (action === 'start') {
      const name = args[1] || 'Buy Competition';
      const hours = parseInt(args[2]) || 24;
      const prize = args.slice(3).join(' ') || undefined;

      const startTime = new Date();
      const endTime = new Date(Date.now() + hours * 60 * 60 * 1000);

      await competitionService.createCompetition({
        groupId: group.id,
        name,
        startTime,
        endTime,
        prizeInfo: prize,
      });

      await ctx.reply(
        `🏆 **${name} Started!**\n\n` +
          `Duration: ${hours} hours\n` +
          `Ends: ${endTime.toLocaleString()}\n` +
          (prize ? `Prize: ${prize}\n` : '') +
          `\nLet the competition begin! Use /competition leaderboard to check standings.`,
        { parse_mode: 'Markdown' }
      );
    } else if (action === 'stop') {
      const active = await competitionService.getActiveCompetition(group.id);
      if (!active) {
        return ctx.reply('No active competition found.');
      }

      const leaderboard = await competitionService.getLeaderboard(active.id, 1);
      const winner = leaderboard.length > 0 ? leaderboard[0].walletAddress : undefined;

      await competitionService.endCompetition(active.id, winner);

      await ctx.reply(
        `🏁 **${active.name} Ended!**\n\n` +
          (winner
            ? `🥇 Winner: \`${winner.slice(0, 8)}...${winner.slice(-6)}\`\n` +
              `Volume: $${leaderboard[0].totalVolume.toFixed(2)}`
            : 'No participants'),
        { parse_mode: 'Markdown' }
      );
    } else if (action === 'leaderboard') {
      const active = await competitionService.getActiveCompetition(group.id);
      if (!active) {
        return ctx.reply('No active competition found.');
      }

      const limit = parseInt(args[1]) || 10;
      const leaderboard = await competitionService.getLeaderboard(active.id, limit);

      if (leaderboard.length === 0) {
        return ctx.reply('No participants yet!');
      }

      const message =
        `🏆 **${active.name}**\n\n` +
        leaderboard
          .map(
            (entry, i) =>
              `${i + 1}. \`${entry.walletAddress.slice(0, 8)}...\`\n` +
              `   💰 $${entry.totalVolume.toFixed(2)} (${entry.totalBuys} buys)`
          )
          .join('\n\n');

      await ctx.reply(message, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    logger.error('Error in competition command:', error);
    await ctx.reply(messages.errorMessage('Failed to manage competition.'));
  }
});

/**
 * Trending command
 */
bot.command('trending', async (ctx) => {
  try {
    const args = ctx.message.text.split(' ').slice(1);
    const limit = parseInt(args[0]) || 10;

    const trending = await trendingService.getTrendingTokens(limit);

    if (trending.length === 0) {
      return ctx.reply('No trending data available yet.');
    }

    const message =
      `🔥 **Trending Tokens (Last Hour)**\n\n` +
      trending
        .map(
          (t) =>
            `${t.rank}. **$${t.tokenSymbol}** (${t.chain.toUpperCase()})\n` +
            `   📊 ${t.buyCount1h} buys | 💰 $${t.volumeUsd1h.toFixed(2)}`
        )
        .join('\n\n');

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('Error in trending command:', error);
    await ctx.reply(messages.errorMessage('Failed to fetch trending.'));
  }
});

// ============================================
// PORTAL SYSTEM COMMANDS & HANDLERS
// ============================================

/**
 * Portal setup command - Interactive wizard (works in private chat)
 */
bot.command('setup', setupWizard.startSetupWizard);

/**
 * Trust level command
 */
bot.command('trustlevel', portalHandlers.handleTrustLevelCommand);

/**
 * Promote user command
 */
bot.command('promote', portalHandlers.handlePromoteCommand);

/**
 * Demote user command
 */
bot.command('demote', portalHandlers.handleDemoteCommand);

/**
 * End lockdown command
 */
bot.command('endlockdown', portalHandlers.handleEndLockdownCommand);

/**
 * Spam config command
 */
bot.command('spamconfig', portalHandlers.handleSpamConfigCommand);

/**
 * Portal stats command
 */
bot.command('portalstats', portalHandlers.handlePortalStatsCommand);

/**
 * Initialize scam patterns command
 */
bot.command('initscam', portalHandlers.handleInitScamPatternsCommand);

// ============================================
// INTERACTIVE WIZARD CALLBACKS
// ============================================

/**
 * Setup wizard callbacks
 */
bot.action(/^setup_add_media$/, setupWizard.handlePortalCustomization);
bot.action(/^setup_change_text$/, setupWizard.handlePortalCustomization);
bot.action(/^setup_add_buttons$/, setupWizard.handlePortalCustomization);
bot.action(/^setup_create_portal$/, setupWizard.completePortalSetup);
bot.action(/^setup_cancel$/, setupWizard.cancelSetupWizard);

/**
 * Portal completion callbacks
 */
bot.action(/^config_group_/, async (ctx) => {
  await ctx.answerCbQuery('⚙️ Opening group settings...');
  let callbackData = '';
  if (ctx.callbackQuery && 'data' in ctx.callbackQuery && ctx.callbackQuery.data) {
    callbackData = ctx.callbackQuery.data;
  }
  const groupId = callbackData.split('_')[2] || undefined;
  await ctx.editMessageText(
    '⚙️ *Group Configuration*\n\n' +
    'Use these commands in your group to manage settings:\n\n' +
    '**Portal Settings:**\n' +
    '`/portalstats` - View portal statistics\n' +
    '`/spamconfig` - Configure spam control\n' +
    '`/trustlevel` - Check user trust levels\n\n' +
    '**Token Tracking:**\n' +
    '`/addtoken` - Add a token to track\n' +
    '`/listtokens` - View tracked tokens\n\n' +
    '**Moderation:**\n' +
    '`/promote` - Promote user trust level\n' +
    '`/demote` - Demote user trust level',
    { parse_mode: 'Markdown' }
  );
});

bot.action(/^setup_complete$/, async (ctx) => {
  await ctx.answerCbQuery('✅ Setup complete!');
  await ctx.editMessageText(
    '✅ *Setup Complete!*\n\n' +
    'Your portal is now active and protecting your group!\n\n' +
    '**Next Steps:**\n' +
    '• Add a token to track with `/addtoken`\n' +
    '• Customize spam settings with `/spamconfig`\n' +
    '• View statistics with `/portalstats`\n\n' +
    'Need help? Use `/help` in your group.',
    { parse_mode: 'Markdown' }
  );
});

bot.action(/^setup_buy_bot$/, async (ctx) => {
  try {
    await ctx.answerCbQuery('📊 Setting up buy bot...');

    // Get the user's info
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!userId || !chatId) {
      return;
    }

    // Get the current state to preserve selectedGroupId
    const currentState = await conversationService.getState(userId, chatId);
    if (!currentState || !currentState.data.selectedGroupId) {
      await ctx.answerCbQuery('❌ Session expired. Please start over with /setup');
      await ctx.editMessageText('❌ Session expired. Please run /setup again in your group.');
      return;
    }

    // Set conversation state for buy bot setup, preserving selectedGroupId
    await conversationService.setState(userId, chatId, 'buybot_select_chain', {
      selectedGroupId: currentState.data.selectedGroupId,
    });

    await ctx.editMessageText(
      '📊 *Buy Bot Setup*\n\n' +
      'Please select the chain of your token below:',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('Ethereum', 'buybot_chain_ethereum')],
          [Markup.button.callback('Solana', 'buybot_chain_solana')],
          [Markup.button.callback('Binance Smart Chain', 'buybot_chain_bsc')],
          [Markup.button.callback('TON', 'buybot_chain_ton')],
          [Markup.button.callback('Base', 'buybot_chain_base')],
          [Markup.button.callback('Polygon', 'buybot_chain_polygon')],
          [Markup.button.callback('❌ Cancel', 'setup_cancel')],
        ]),
      }
    );
  } catch (error) {
    logger.error('Error in setup_buy_bot handler:', error);
    await ctx.answerCbQuery('❌ An error occurred');
    await ctx.editMessageText('❌ An error occurred. Please try /setup again.');
  }
});

/**
 * Handle buy bot chain selection
 */
bot.action(/^buybot_chain_(.+)$/, async (ctx) => {
  const chain = ctx.match[1];
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!userId || !chatId) {
    return;
  }

  await ctx.answerCbQuery(`Selected: ${chain}`);

  // Update conversation state with selected chain
  await conversationService.updateData(userId, chatId, { selectedChain: chain });
  await conversationService.nextStep(userId, chatId, 'buybot_enter_address');

  // Ask for token address
  const chainNames: { [key: string]: string } = {
    ethereum: 'Ethereum',
    solana: 'Solana',
    bsc: 'Binance Smart Chain',
    ton: 'TON',
    base: 'Base',
    polygon: 'Polygon',
  };

  await ctx.editMessageText(
    `📊 *Buy Bot Setup*\n\n` +
    `Chain: *${chainNames[chain] || chain}*\n\n` +
    `Send the token address to track [${chainNames[chain] || chain}]`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'setup_cancel')]]),
    }
  );
});

/**
 * Start menu callbacks
 */
bot.action(/^start_/, startHandler.handleStartMenuCallback);

/**
 * Handle new members joining (anti-raid + trust levels)
 */
bot.on('new_chat_members', portalEvents.handleNewChatMembers);

/**
 * Handle text messages during setup wizard (must be before general message handler)
 */
bot.on('text', setupWizard.handleSetupTextInput);

/**
 * Handle shared chats (group/channel picker response)
 */
bot.on(message('chat_shared'), setupWizard.handleChatShared);

/**
 * Handle all messages (setup wizard input, spam/scam filtering + trust tracking)
 */
bot.on('message', async (ctx, next) => {
  // First check if this is a setup wizard text input (only in private chats)
  if (ctx.chat?.type === 'private' && 'text' in ctx.message) {
    await setupWizard.handleSetupTextInput(ctx);
  }

  // Continue to spam/scam filtering for group messages
  return next();
});

bot.on('message', portalEvents.handleMessage);

/**
 * Handle verification callback
 */
bot.action(/^verify_/, portalEvents.handleVerifyCallback);

/**
 * Handle answer callback
 */
bot.action(/^answer_/, portalEvents.handleAnswerCallback);

/**
 * Handle admin help menu callbacks
 */
bot.action(/^help_/, helpHandler.handleAdminHelpAction);

/**
 * Handle "I am human" verification tap (non-premium)
 */
bot.action(/^human_/, startHandler.handleHumanVerification);

/**
 * Error handler
 */
bot.catch((err, ctx) => {
  logger.error('Bot error:', err);
  ctx.reply(messages.errorMessage('An unexpected error occurred.'));
});

/**
 * Graceful shutdown
 */
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

/**
 * Start bot
 */
export async function startBot() {
  try {
    // Connect to database and Redis
    await connectDatabase();
    await connectRedis();

    // Initialize scam detection patterns (one-time)
    logger.info('Initializing scam detection patterns...');
    await scamBlockerService.initializeScamPatterns();
    const scamStats = await scamBlockerService.getScamStats();
    logger.info(`Scam patterns initialized: ${scamStats?.total || 0} patterns loaded`);

    // Launch bot
    if (config.telegram.webhookUrl) {
      // Webhook mode (production)
      await bot.telegram.setWebhook(config.telegram.webhookUrl, {
        secret_token: config.telegram.webhookSecret,
      });
      logger.info(`Bot started in webhook mode: ${config.telegram.webhookUrl}`);
    } else {
      // Polling mode (development)
      await bot.launch();
      logger.info('Bot started in polling mode');
    }

    // Start background cleanup tasks
    startBackgroundTasks();

    logger.info('Telegram bot is running');
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

/**
 * Background cleanup and maintenance tasks
 */
function startBackgroundTasks() {
  // Cleanup expired items every 5 minutes
  setInterval(async () => {
    try {
      const expiredAttempts = await verificationService.cleanupExpiredAttempts();
      const expiredLinks = await portalService.cleanupExpiredLinks();
      const resolvedRaids = await antiRaidService.autoResolveExpiredLockdowns();
      const expiredConversations = await conversationService.cleanupExpiredConversations();

      if (expiredAttempts > 0 || expiredLinks > 0 || resolvedRaids > 0 || expiredConversations > 0) {
        logger.info('Cleanup completed:', {
          expiredAttempts,
          expiredLinks,
          resolvedRaids,
          expiredConversations,
        });
      }
    } catch (error) {
      logger.error('Cleanup task error:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes

  // Statistics and health check every hour
  setInterval(async () => {
    try {
      logger.info('Hourly health check running...');
      // Add any health checks or stats aggregation here
    } catch (error) {
      logger.error('Health check error:', error);
    }
  }, 60 * 60 * 1000); // 1 hour

  logger.info('Background tasks started');
}

// Export bot instance for webhook integration
export default bot;

// Handle uncaught errors - log but don't exit to keep bot running
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  // Don't exit - let the bot continue running
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit - let the bot continue running
});

// Start bot if this file is run directly
if (require.main === module) {
  startBot();
}
