/**
 * Enhanced /start Command Handler (Safeguard-style)
 * Shows main menu with quick actions and documentation
 */

import { Context, Markup } from 'telegraf';
import logger from '../utils/logger';

/**
 * Handle /start command in private chat
 */
export async function handleStartCommand(ctx: Context) {
  try {
    const chatType = ctx.chat?.type;
    const userName = ctx.from?.first_name || 'there';

    // Check for deep link parameters (e.g., /start setup)
    if (chatType === 'private' && 'text' in ctx.message!) {
      const args = ctx.message.text.split(' ');
      if (args.length > 1 && args[1] === 'setup') {
        // Redirect to setup wizard
        const { startSetupWizard } = await import('./setup.wizard');
        return startSetupWizard(ctx);
      }
    }

    if (chatType === 'private') {
      // Private chat - show main menu
      await ctx.reply(
        `🔰 *Safeguard Bot V1.0*\n\n` +
          `Welcome ${userName}! The ultimate bot for crypto groups!\n\n` +
          `Telegram's best protection & token buy tracker\n\n` +
          `*Quick Commands:*\n` +
          `/setup  -  Create a portal\n` +
          `/config  -  Enter group config\n` +
          `/add  -  Add a token to buy bot\n` +
          `/trending  -  View trending tokens\n\n` +
          `📖  [Documentation](https://github.com/yourusername/telegram-bot)\n` +
          `🐦  [Follow us on Twitter](https://twitter.com/yourhandle)\n` +
          `📹  [Setup Tutorial](https://youtube.com/watch?v=tutorial)\n` +
          `🔒  [Privacy Policy](https://yoursite.com/privacy)`,
        {
          parse_mode: 'Markdown',
          link_preview_options: { is_disabled: true },
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🛡️ Create Portal', 'start_setup')],
            [Markup.button.callback('⚙️ Group Settings', 'start_config')],
            [
              Markup.button.callback('📊 Add Token', 'start_add_token'),
              Markup.button.callback('🔥 Trending', 'start_trending'),
            ],
            [Markup.button.callback('❓ Help', 'start_help')],
          ]),
        }
      );
    } else {
      // Group chat - simple welcome
      await ctx.reply(
        `👋 Hello! I'm now active in this group.\n\n` +
          `Admins can use /help to see available commands.\n` +
          `For setup and configuration, message me privately at @${ctx.botInfo?.username}`,
        {
          parse_mode: 'Markdown',
        }
      );
    }
  } catch (error) {
    logger.error('Error handling /start command:', error);
    await ctx.reply('❌ An error occurred. Please try again.');
  }
}

/**
 * Handle inline button callbacks from /start menu
 */
export async function handleStartMenuCallback(ctx: Context) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      return;
    }

    const action = ctx.callbackQuery.data;

    switch (action) {
      case 'start_setup':
        // Trigger setup wizard
        await ctx.answerCbQuery('Opening setup wizard...');
        // This will be handled by the setup wizard handler
        break;

      case 'start_config':
        await ctx.answerCbQuery('Opening config menu...');
        await ctx.editMessageText(
          '🛠️ *Safeguard Console*\n\n' +
            'Select a group to configure, or use the quick actions below.\n\n' +
            '_Tip: Use /config in any group for direct access_',
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📋 My Groups', 'config_list_groups')],
              [Markup.button.callback('⬅️ Back to Menu', 'start_back')],
            ]),
          }
        );
        break;

      case 'start_add_token':
        await ctx.answerCbQuery('Add token...');
        await ctx.editMessageText(
          '📊 *Add Token to Buy Bot*\n\n' +
            'Track buy/sell events for your token across multiple chains.\n\n' +
            '*Supported Chains:*\n' +
            '• Solana\n' +
            '• Ethereum\n' +
            '• BSC\n' +
            '• Base\n' +
            '• Polygon\n\n' +
            'Use this command in your group:\n' +
            '`/addtoken <chain> <address> <symbol>`',
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back to Menu', 'start_back')]]),
          }
        );
        break;

      case 'start_trending':
        await ctx.answerCbQuery('View trending...');
        await ctx.editMessageText(
          '🔥 *Trending Tokens*\n\n' +
            'View the most active tokens being tracked.\n\n' +
            'Use `/trending` in any group to see trending tokens.',
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back to Menu', 'start_back')]]),
          }
        );
        break;

      case 'start_help':
        await ctx.answerCbQuery('Opening help...');
        await ctx.editMessageText(
          '❓ *Help & Commands*\n\n' +
            '*User Commands:*\n' +
            '`/start` - Show this menu\n' +
            '`/help` - Get help\n' +
            '`/verify` - Verify membership\n' +
            '`/trustlevel` - Check your trust level\n\n' +
            '*Admin Commands:*\n' +
            '`/setup` - Create portal (private chat)\n' +
            '`/config` - Group settings\n' +
            '`/addtoken` - Add token to track\n' +
            '`/portalstats` - Portal statistics\n\n' +
            'For full documentation, visit our GitHub.',
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back to Menu', 'start_back')]]),
          }
        );
        break;

      case 'start_back':
        // Go back to main menu
        await handleStartCommand(ctx);
        await ctx.answerCbQuery();
        break;

      default:
        await ctx.answerCbQuery();
    }
  } catch (error) {
    logger.error('Error handling start menu callback:', error);
    await ctx.answerCbQuery('❌ An error occurred');
  }
}

export default {
  handleStartCommand,
  handleStartMenuCallback,
};