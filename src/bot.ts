import { Telegraf, Context, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import config from './config';
import logger from './utils/logger';
import { connectDatabase } from './utils/database';
import { connectRedis, CacheService } from './utils/redis';
import userService from './services/user.service';
import groupService from './services/group.service';
import tokenService from './services/token.service';
import transactionService from './services/transaction.service';
import * as messages from './templates/messages';
import { sanitizeInput } from './utils/formatters';

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
 * Start command
 */
bot.command('start', async (ctx) => {
  try {
    if (ctx.chat.type === 'private') {
      await ctx.reply(
        'Welcome to Safeguard Bot! 🛡️\n\n' +
          'Add me to your Telegram group to start tracking tokens and verifying users.\n\n' +
          'Use /help to see all available commands.'
      );
    } else {
      // Upsert group
      if ('title' in ctx.chat) {
        await groupService.upsertGroup(ctx.chat);
        await ctx.reply(messages.welcomeMessage(ctx.chat.title));
      }
    }
  } catch (error) {
    logger.error('Error in start command:', error);
    await ctx.reply(messages.errorMessage('Failed to start bot.'));
  }
});

/**
 * Help command
 */
bot.command('help', async (ctx) => {
  try {
    const isAdminUser = await isAdmin(ctx);
    if (isAdminUser) {
      await ctx.reply(messages.adminHelpMessage(), { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(messages.helpMessage(), { parse_mode: 'Markdown' });
    }
  } catch (error) {
    logger.error('Error in help command:', error);
  }
});

/**
 * New member handler - send verification prompt
 */
bot.on(message('new_chat_members'), async (ctx) => {
  try {
    const newMembers = ctx.message.new_chat_members;

    for (const member of newMembers) {
      // Skip bots
      if (member.is_bot) continue;

      // Create/update user
      await userService.upsertUser(member);

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
      return ctx.answerCbQuery('This verification is not for you!');
    }

    // Get or create user
    let user = await userService.getUserByTelegramId(ctx.from.id);
    if (!user) {
      user = await userService.upsertUser(ctx.from);
    }

    // Get or create group
    if (!ctx.chat || !('title' in ctx.chat)) {
      return ctx.answerCbQuery('Verification only works in groups!');
    }

    let group = await groupService.getGroupByTelegramId(ctx.chat.id);
    if (!group) {
      group = await groupService.upsertGroup(ctx.chat);
    }

    // Verify user in group
    await groupService.verifyUser(user.id, group.id);

    await ctx.answerCbQuery('✅ Verified successfully!');
    await ctx.editMessageText(messages.verificationSuccess(), { parse_mode: 'Markdown' });

    logger.info(`User ${ctx.from.id} verified in group ${ctx.chat.id}`);
  } catch (error) {
    logger.error('Error in verification callback:', error);
    await ctx.answerCbQuery('Verification failed. Please try again.');
  }
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

    // Add token
    const token = await tokenService.addTrackedToken({
      groupId: group.id,
      chain: sanitizeInput(chain),
      tokenAddress: sanitizeInput(address),
      tokenSymbol: sanitizeInput(symbol),
      tokenName: name ? sanitizeInput(name) : undefined,
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

    logger.info(`Token ${symbol} added to group ${ctx.chat.id}`);
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

    logger.info('Telegram bot is running');
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
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
