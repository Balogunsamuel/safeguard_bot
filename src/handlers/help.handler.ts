import { Context } from 'telegraf';
import * as messages from '../templates/messages';
import logger from '../utils/logger';

/**
 * Handle admin help menu callbacks
 */
export async function handleAdminHelpAction(ctx: Context) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    const action = ctx.callbackQuery.data;
    await ctx.answerCbQuery();

    let text: string | null = null;
    switch (action) {
      case 'help_addtoken':
        text = messages.adminHelpAddToken();
        break;
      case 'help_listtokens':
        text = messages.adminHelpListTokens();
        break;
      case 'help_thresholds':
        text = messages.adminHelpThresholds();
        break;
      case 'help_whale':
        text = messages.adminHelpWhale();
        break;
      case 'help_buttons':
        text = messages.adminHelpButtons();
        break;
      case 'help_media':
        text = messages.adminHelpMedia();
        break;
      case 'help_emoji':
        text = messages.adminHelpEmoji();
        break;
      case 'help_portal':
        text = messages.adminHelpPortal();
        break;
      case 'help_blacklist':
        text = messages.adminHelpBlacklist();
        break;
      case 'help_competitions':
        text = messages.adminHelpCompetitions();
        break;
      case 'help_stats':
        text = messages.adminHelpStats();
        break;
      default:
        break;
    }

    if (text) {
      await ctx.reply(text, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    logger.error('Error handling admin help action:', error);
  }
}

export default {
  handleAdminHelpAction,
};
