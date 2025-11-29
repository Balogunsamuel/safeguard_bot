import { Context, Markup } from 'telegraf';
import * as messages from '../templates/messages';
import logger from '../utils/logger';

/**
 * Handle admin help menu callbacks
 */
export async function handleAdminHelpAction(ctx: Context) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    const action = ctx.callbackQuery.data;

    // Always attempt to acknowledge the callback, ignore stale errors
    try {
      await ctx.answerCbQuery();
    } catch {
      /* ignore */
    }

    let text: string | null = null;
    let replyMarkup: any = messages.adminHelpSectionKeyboard();

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
      case 'help_back':
        text = messages.adminHelpMessage();
        replyMarkup = messages.adminHelpKeyboard();
        break;
      default:
        break;
    }

    if (text) {
      // Prefer editing the existing help message to keep buttons working in groups
      try {
        await ctx.editMessageText(text, {
          parse_mode: 'Markdown',
          reply_markup: replyMarkup,
          disable_web_page_preview: true,
        });
      } catch (err) {
        // Fallback to sending a new message if edit fails (e.g., message too old)
        await ctx.reply(text, {
          parse_mode: 'Markdown',
          reply_markup: replyMarkup,
          disable_web_page_preview: true,
        });
      }
    }
  } catch (error) {
    logger.error('Error handling admin help action:', error);
  }
}

export default {
  handleAdminHelpAction,
};
