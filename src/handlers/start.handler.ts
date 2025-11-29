/**
 * Enhanced /start Command Handler (Safeguard-style)
 * Shows main menu with quick actions and documentation
 */

import { Context, Markup } from 'telegraf';
import logger from '../utils/logger';
import portalService from '../services/portal.service';

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
      if (args.length > 1) {
        const payload = args[1];

        if (payload === 'setup') {
          // Redirect to setup wizard
          const { startSetupWizard } = await import('./setup.wizard');
          return startSetupWizard(ctx);
        }

        if (payload.startsWith('verify_')) {
          const portalId = payload.replace('verify_', '');
          return handlePortalVerifyStart(ctx, portalId);
        }
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

/**
 * Handle portal verification start payload (/start verify_<portalId>)
 * Premium users get instant one-time link.
 * Non-premium users get an "I am human" button to confirm before receiving the link.
 */
async function handlePortalVerifyStart(ctx: Context, portalId: string) {
  try {
    const chatType = ctx.chat?.type;
    if (chatType !== 'private') {
      return;
    }

    const portal = await portalService.getPortalById(portalId);
    if (!portal) {
      await ctx.reply('❌ Portal not found. Please try again.');
      return;
    }

    const isPremium = ctx.from?.is_premium || false;

    if (isPremium) {
      try {
        const invite = await portalService.generateInviteLink(portal.groupId, portal.id, BigInt(ctx.from!.id), ctx);
        await ctx.reply(
          `🎉 Premium detected!\n\n` +
            `Here is your one-time link to join the group:\n${invite.inviteLink}\n\n` +
            `⚠️ Single use. Do not share.`,
          { disable_web_page_preview: true }
        );
        return;
      } catch (error) {
        logger.error('Error generating invite for premium user:', error);
        await ctx.reply('❌ Could not generate your invite link. Please try again.');
        return;
      }
    }

    // Non-premium: show human verification button (no captcha, single tap)
    await ctx.reply(
      `🔐 Verify to Join\n\nTap the button below to confirm you are human and get your one-time link.`,
      {
        ...Markup.inlineKeyboard([[Markup.button.callback('✅ I am human', `human_${portalId}`)]]),
      }
    );
  } catch (error) {
    logger.error('Error handling portal verify start:', error);
    await ctx.reply('❌ An error occurred. Please try again.');
  }
}

/**
 * Handle "I am human" tap (non-premium quick verification)
 */
export async function handleHumanVerification(ctx: Context) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      return;
    }
    const data = ctx.callbackQuery.data || '';
    const match = data.match(/^human_(.+)$/);
  if (!match) return;

  const portalId = match[1];
  const chatType = ctx.chat?.type;
  if (chatType !== 'private') {
    try {
      await ctx.answerCbQuery();
    } catch (err) {
      // ignore stale query errors
    }
    return;
  }

  try {
    await ctx.answerCbQuery();
  } catch (err) {
    // ignore stale query errors
  }

    const portal = await portalService.getPortalById(portalId);
    if (!portal) {
      await ctx.reply('❌ Portal not found. Please try again.');
      return;
    }

    try {
      const invite = await portalService.generateInviteLink(portal.groupId, portal.id, BigInt(ctx.from!.id), ctx);
      await ctx.reply(
        `✅ Verified!\n\nHere is your one-time link to join the group:\n${invite.inviteLink}\n\n` +
          `⚠️ Single use. Do not share.`,
        { disable_web_page_preview: true }
      );
    } catch (error) {
      logger.error('Error generating invite after human tap:', error);
      await ctx.reply('❌ Could not generate your invite link. Please try again.');
    }
  } catch (error) {
    logger.error('Error handling human verification:', error);
  }
}

export default {
  handleStartCommand,
  handleStartMenuCallback,
  handleHumanVerification,
};
