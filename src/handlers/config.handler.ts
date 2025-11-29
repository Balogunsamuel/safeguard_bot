import { Context, Markup } from 'telegraf';
import prisma from '../utils/database';
import logger from '../utils/logger';
import userService from '../services/user.service';
import groupService from '../services/group.service';
import { sanitizeInput } from '../utils/formatters';

type GroupRecord = {
  id: string;
  title: string;
  telegramId: bigint;
};

/**
 * Check if a user is admin/owner in a given group
 */
async function isUserAdminOfGroup(ctx: Context, groupId: bigint, userId: number) {
  try {
    const member = await ctx.telegram.getChatMember(groupId.toString(), userId);
    return member.status === 'creator' || member.status === 'administrator';
  } catch (error) {
    // Likely bot not in group or chat not found; skip silently
    logger.debug(`Skipped admin check for group ${groupId}: ${String(error)}`);
    return false;
  }
}

/**
 * Find groups where the user is an admin/owner and the bot is present
 */
async function getAdminGroups(ctx: Context, userId: number): Promise<GroupRecord[]> {
  const groups = await prisma.group.findMany({ where: { isActive: true } });
  const adminGroups: GroupRecord[] = [];

  for (const group of groups) {
    const isAdmin = await isUserAdminOfGroup(ctx, group.telegramId, userId);
    if (isAdmin) {
      adminGroups.push({
        id: group.id,
        title: group.title,
        telegramId: group.telegramId,
      });
    }
  }

  return adminGroups;
}

/**
 * Build inline keyboard rows for a list of groups
 */
function buildGroupKeyboard(groups: GroupRecord[]) {
  return Markup.inlineKeyboard(
    groups.map((group) => [
      Markup.button.callback(
        sanitizeInput(group.title).slice(0, 60),
        `config_group_${group.id}`
      ),
    ])
  );
}

/**
 * Build the main config console keyboard for a group
 */
function buildConfigMenuKeyboard(groupId: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🛡️ Group Protection', `config_menu_protection_${groupId}`)],
    [Markup.button.callback('👋 Greetings', `config_menu_greetings_${groupId}`)],
    [Markup.button.callback('💡 Filters', `config_menu_filters_${groupId}`)],
    [Markup.button.callback('🌀 Create Portal', `config_menu_portal_${groupId}`)],
    [Markup.button.callback('🟢 Buy Bot', `config_menu_buybot_${groupId}`)],
    [Markup.button.callback('⬅️ Select Another Group', 'config_list_groups')],
  ]);
}

/**
 * Reply with a picker of groups the user belongs to
 */
async function showGroupPicker(
  ctx: Context,
  groups: GroupRecord[],
  mode: 'reply' | 'edit' = 'reply'
) {
  const text =
    '🛠️ *Safeguard Console*\n\n' +
    'Select the group you\'d like to access below. ' +
    'Tip: Use /config inside any group to jump straight to its settings.';

  const options = {
    parse_mode: 'Markdown',
    ...buildGroupKeyboard(groups),
  };

  if (mode === 'edit' && 'editMessageText' in ctx) {
    await ctx.editMessageText(text, options);
  } else {
    await ctx.reply(text, options);
  }
}

/**
 * Render the config console for a selected group
 */
async function showConfigMenu(
  ctx: Context,
  group: GroupRecord,
  mode: 'reply' | 'edit' = 'reply',
  focus: string | null = null
) {
  const focusTextMap: Record<string, string> = {
    protection:
      '🛡️ *Group Protection*\nAdjust anti-raid and spam controls. Use `/spamconfig` in the group to tweak filters.',
    greetings:
      '👋 *Greetings*\nCustomize welcome and onboarding messages. Use `/help` for current options.',
    filters:
      '💡 *Filters*\nFine-tune URL, contract, and Telegram link blocking with `/spamconfig`.',
    portal:
      '🌀 *Create Portal*\nRun `/setup` in the group to launch a verification portal or `/updateportal` to refresh it.',
    buybot:
      '🟢 *Buy Bot*\nAdd tokens with `/addtoken <chain> <address> <symbol>` and set thresholds with `/setminusd`.',
  };

  const section = focus ? focusTextMap[focus] || '' : '';

  const text =
    '🛠️ *Safeguard Console*\n' +
    `Group: *${sanitizeInput(group.title)}*\n\n` +
    'Click the options below to jump to a configuration area. ' +
    'You can manage protection, greetings, filters, portals, and buy bot settings from here.\n\n' +
    (section ? section : 'Choose a category to view the available actions.');

  const options = {
    parse_mode: 'Markdown',
    ...buildConfigMenuKeyboard(group.id),
  };

  if (mode === 'edit' && 'editMessageText' in ctx) {
    await ctx.editMessageText(text, options);
  } else {
    await ctx.reply(text, options);
  }
}

/**
 * /config command - show group picker or open current group settings
 */
export async function handleConfigCommand(ctx: Context) {
  try {
    if (!ctx.from) return;

    // Ensure we have a user record
    let user = await userService.getUserByTelegramId(ctx.from.id);
    if (!user) {
      user = await userService.upsertUser(ctx.from);
    }

    // If run inside a group, open that group's menu directly (admin only)
    if (ctx.chat?.type !== 'private') {
      if (!('title' in ctx.chat) || !ctx.chat.title) {
        return ctx.reply('❌ Group details are unavailable.');
      }

      const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
      const isAdmin = member.status === 'creator' || member.status === 'administrator';
      if (!isAdmin) {
        return ctx.reply('❌ Only group admins can access configuration.');
      }

      const existingGroup =
        (await groupService.getGroupByTelegramId(ctx.chat.id)) ||
        (await groupService.upsertGroup(ctx.chat));

      return showConfigMenu(
        ctx,
        {
          id: existingGroup.id,
          title: existingGroup.title,
          telegramId: existingGroup.telegramId,
        },
        'reply'
      );
    }

    // Private chat - list groups where the user is verified
    const groups = await getAdminGroups(ctx, ctx.from.id);

    if (groups.length === 0) {
      return ctx.reply(
        '⚙️ No groups found.\n\n' +
          'I could not find any groups where you are an admin and I am present.\n' +
          'Add me to your group as admin and run /config again.'
      );
    }

    await showGroupPicker(ctx, groups, 'reply');
  } catch (error) {
    logger.error('Error handling /config command:', error);
    await ctx.reply('❌ Failed to open configuration. Please try again.');
  }
}

/**
 * Callback from "My Groups" button
 */
export async function handleConfigListGroups(ctx: Context) {
  try {
    if (!ctx.from) return;
    await ctx.answerCbQuery();

    const user = await userService.getUserByTelegramId(ctx.from.id);
    if (!user) {
      return ctx.editMessageText('❌ Could not load your account. Please run /start again.');
    }

    const groups = await getAdminGroups(ctx, ctx.from.id);

    if (groups.length === 0) {
      return ctx.editMessageText(
        '⚙️ No groups found.\n\nAdd me to your group as admin and try again.',
        { parse_mode: 'Markdown' }
      );
    }

    await showGroupPicker(ctx, groups, 'edit');
  } catch (error) {
    logger.error('Error handling config group list:', error);
    if ('answerCbQuery' in ctx) {
      await ctx.answerCbQuery('❌ Failed to load groups');
    }
  }
}

/**
 * Callback when a group is selected from the picker
 */
export async function handleConfigGroupSelection(ctx: Context) {
  try {
    if (!ctx.from || !ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    await ctx.answerCbQuery('⚙️ Opening group settings...');

    const [, , groupId] = ctx.callbackQuery.data.split('_');
    if (!groupId) {
      return ctx.editMessageText('❌ Invalid group selection.');
    }

    const group = await prisma.group.findUnique({ where: { id: groupId, isActive: true } });
    if (!group) {
      return ctx.editMessageText('❌ Group not found. Please try again.');
    }

    // Verify the user is admin/owner of this group
    const isAdmin = await isUserAdminOfGroup(ctx, group.telegramId, ctx.from.id);
    if (!isAdmin) {
      return ctx.editMessageText('❌ You must be an admin of this group to configure it.');
    }

    await showConfigMenu(
      ctx,
      { id: group.id, title: group.title, telegramId: group.telegramId },
      'edit'
    );
  } catch (error) {
    logger.error('Error handling config group selection:', error);
    await ctx.editMessageText('❌ Failed to open group configuration.');
  }
}

/**
 * Callback when a config menu button is pressed
 */
export async function handleConfigMenuAction(ctx: Context) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    await ctx.answerCbQuery();

    const [, , focus, groupId] = ctx.callbackQuery.data.split('_');
    if (!groupId) {
      return ctx.editMessageText('❌ Invalid selection.');
    }

    const group = await prisma.group.findUnique({ where: { id: groupId, isActive: true } });
    if (!group) {
      return ctx.editMessageText('❌ Group not found.');
    }

    const isAdmin = await isUserAdminOfGroup(ctx, group.telegramId, ctx.from.id);
    if (!isAdmin) {
      return ctx.editMessageText('❌ You must be an admin of this group to configure it.');
    }

    await showConfigMenu(
      ctx,
      { id: group.id, title: group.title, telegramId: group.telegramId },
      'edit',
      focus || null
    );
  } catch (error) {
    logger.error('Error handling config menu action:', error);
    if ('answerCbQuery' in ctx) {
      await ctx.answerCbQuery('❌ Failed to open section');
    }
  }
}
