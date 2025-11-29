/**
 * Interactive Setup Wizard (Safeguard-style)
 * Handles portal setup through private chat with keyboard buttons
 */

import { Context, Markup } from 'telegraf';
import { conversationService } from '../services/conversation.service';
import portalService from '../services/portal.service';
import groupService from '../services/group.service';
import tokenService from '../services/token.service';
import logger from '../utils/logger';
import prisma from '../utils/database';

interface SetupWizardContext extends Context {
  session?: any;
}

/**
 * Start the setup wizard - /setup command (works in both private chat and groups)
 */
export async function startSetupWizard(ctx: SetupWizardContext) {
  try {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!userId || !chatId) {
      return;
    }

    // If in group, show redirect message with button to go to bot PM
    if (ctx.chat?.type !== 'private') {
      // User must be admin to setup portal
      try {
        const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
        if (member.status !== 'creator' && member.status !== 'administrator') {
          await ctx.reply('❌ Only group admins can use this command.');
          return;
        }
      } catch (error) {
        logger.error('Error checking admin status:', error);
        await ctx.reply('❌ Could not verify admin status.');
        return;
      }

      // Auto-register the group if not in database
      try {
        let group = await groupService.getGroupByTelegramId(ctx.chat.id);
        if (!group && 'title' in ctx.chat) {
          group = await groupService.upsertGroup(ctx.chat as any);
          logger.info(`Auto-registered group during setup: ${ctx.chat.title}`);
        }
      } catch (error) {
        logger.error('Error registering group:', error);
      }

      // Show redirect message with deep link button
      const botUsername = ctx.botInfo?.username || 'SafeguardBot';
      await ctx.reply(
        '💫 Click the button below to setup your portal\n\n' +
          'To use previous setup, type /oldsetup',
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🛡️ Create a Portal',
                  url: `https://t.me/${botUsername}?start=setup`,
                },
              ],
            ],
          },
        }
      );
      return;
    }

    // In private chat - show main setup flow
    await showGroupSelection(ctx);
  } catch (error) {
    logger.error('Error starting setup wizard:', error);
    await ctx.reply('❌ An error occurred while starting the setup wizard.');
  }
}

/**
 * Show group selection with keyboard buttons
 */
async function showGroupSelection(ctx: SetupWizardContext) {
  try {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!userId || !chatId) {
      return;
    }

    // Set conversation state (waiting for native chat picker)
    await conversationService.setState(userId, chatId, 'setup_select_group', {});

    await ctx.reply(
      '💫 *Safeguard Fast Setup*\n\n' +
        'Tap the button below and choose the group you want to protect.\n' +
        'Telegram will show only groups where you are an admin and can add the bot.\n\n' +
        '_(If you don\'t see a group, add the bot there as admin and try again.)_',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            [
              {
                text: '👥 Select Group',
                request_chat: {
                  request_id: 2,
                  chat_is_channel: false,
                  chat_is_forum: false,
                  user_administrator_rights: {
                    is_anonymous: false,
                    can_manage_chat: true, // manage messages/pins
                    can_delete_messages: true,
                    can_manage_video_chats: false,
                    can_restrict_members: true,
                    can_promote_members: false,
                    can_change_info: false,
                    can_invite_users: true,
                    can_post_messages: false,
                    can_edit_messages: false,
                    can_pin_messages: false,
                    can_manage_topics: false,
                  },
                  bot_administrator_rights: {
                    is_anonymous: false,
                    can_manage_chat: true,
                    can_delete_messages: true,
                    can_manage_video_chats: false,
                    can_restrict_members: true,
                    can_promote_members: false,
                    can_change_info: false,
                    can_invite_users: true,
                    can_post_messages: false,
                    can_edit_messages: false,
                    can_pin_messages: false,
                    can_manage_topics: false,
                  },
                  bot_is_member: true,
                },
              },
            ],
            [{ text: '❌ Cancel' }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }
    );
  } catch (error) {
    logger.error('Error showing group selection:', error);
    await ctx.reply('❌ An error occurred.');
  }
}

/**
 * Show channel selection with keyboard button (using Telegram's native channel picker)
 */
async function showChannelSelection(ctx: SetupWizardContext) {
  try {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!userId || !chatId) {
      return;
    }

    // Set state to wait for channel selection
    await conversationService.nextStep(userId, chatId, 'setup_select_channel');

    // Use Telegram's native Request Channel button
    await ctx.reply(
      '💫 *Safeguard Fast Setup*\n\n' +
        'To begin, click below and select the channel you want to attach your portal to\n\n' +
        '_(Safeguard will be automatically added as admin)_',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            [
              {
                text: '📢 Select Channel',
                request_chat: {
                  request_id: 1,
                  chat_is_channel: true,
                  user_administrator_rights: {
                    is_anonymous: false,
                    can_manage_chat: true,
                    can_delete_messages: true,
                    can_manage_video_chats: false,
                    can_restrict_members: false,
                    can_promote_members: false,
                    can_change_info: true,
                    can_invite_users: true,
                    can_post_messages: true,
                    can_edit_messages: true,
                    can_pin_messages: true,
                    can_manage_topics: false,
                  },
                  bot_administrator_rights: {
                    is_anonymous: false,
                    can_manage_chat: true,
                    can_delete_messages: true,
                    can_manage_video_chats: false,
                    can_restrict_members: false,
                    can_promote_members: false,
                    can_change_info: true,
                    can_invite_users: true,
                    can_post_messages: true,
                    can_edit_messages: true,
                    can_pin_messages: true,
                    can_manage_topics: false,
                  },
                  bot_is_member: false,
                },
              },
            ],
            [{ text: '❌ Cancel' }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }
    );
  } catch (error) {
    logger.error('Error showing channel selection:', error);
    await ctx.reply('❌ An error occurred.');
  }
}

/**
 * Handle channel shared via request_chat button
 */
export async function handleChannelShared(ctx: SetupWizardContext) {
  try {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!userId || !chatId || !ctx.message || !('chat_shared' in ctx.message)) {
      return;
    }

    // Only handle channel selections (request_id 1)
    if (ctx.message.chat_shared.request_id !== 1) {
      return;
    }

    const state = await conversationService.getState(userId, chatId);
    if (!state || state.step !== 'setup_select_channel') {
      return; // Not in channel selection step
    }

    const sharedChat = ctx.message.chat_shared;
    const sharedChatId = sharedChat.chat_id;

    // Get channel information
    try {
      const chat = await ctx.telegram.getChat(sharedChatId);

      if (chat.type !== 'channel') {
        await ctx.reply('❌ This is not a channel. Please select a channel.');
        return;
      }

      // Check if bot is admin in the channel
      const admins = await ctx.telegram.getChatAdministrators(sharedChatId);
      const botId = ctx.botInfo.id;
      const isBotAdmin = admins.some((admin) => admin.user.id === botId);

      if (!isBotAdmin) {
        await ctx.reply(
          '❌ I am not an admin in this channel.\n\n' +
            'Please make me an admin in the channel with these permissions:\n' +
            '• Post messages\n' +
            '• Edit messages\n' +
            '• Delete messages\n\n' +
            'Then try again.',
          { reply_markup: { remove_keyboard: true } }
        );
        return;
      }

      const channelTitle = 'title' in chat ? chat.title : 'Unknown Channel';
      const channelUsername = 'username' in chat && chat.username ? `@${chat.username}` : '';

      // Store channel info in conversation state
      await conversationService.updateData(userId, chatId, {
        channelId: sharedChatId.toString(),
        channelUsername: channelUsername || sharedChatId.toString(),
        channelTitle,
      });

      await ctx.reply(`✅ Channel verified!\n\n📢 *${channelTitle}*`, {
        parse_mode: 'Markdown',
        reply_markup: { remove_keyboard: true },
      });

      // Move to customization step
      await conversationService.nextStep(userId, chatId, 'setup_customize_portal');
      await showPortalCustomization(ctx);
    } catch (error: any) {
      logger.error('Error getting shared channel info:', error);
      await ctx.reply('❌ Could not access the channel. Please make sure I am added as an admin.');
    }
  } catch (error) {
    logger.error('Error handling channel shared:', error);
      await ctx.reply('❌ An error occurred. Please try again.');
  }
}

/**
 * Handle group shared via request_chat button
 */
export async function handleGroupShared(ctx: SetupWizardContext) {
  try {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!userId || !chatId || !ctx.message || !('chat_shared' in ctx.message)) {
      return;
    }

    // Only handle group selections (request_id 2)
    if (ctx.message.chat_shared.request_id !== 2) {
      return;
    }

    const state = await conversationService.getState(userId, chatId);
    if (!state || state.step !== 'setup_select_group') {
      return; // Not waiting for group selection
    }

    let sharedChatId = ctx.message.chat_shared.chat_id;

    try {
      let chat: any;
      try {
        chat = await ctx.telegram.getChat(sharedChatId);
      } catch (err: any) {
        // Handle migration from group to supergroup
        const migrateId = err?.parameters?.migrate_to_chat_id;
        if (migrateId) {
          sharedChatId = migrateId;
          chat = await ctx.telegram.getChat(sharedChatId);
        } else {
          throw err;
        }
      }

      if (chat.type !== 'supergroup' && chat.type !== 'group') {
        await ctx.reply('❌ Please select a group or supergroup.');
        return;
      }

      const groupTitle = 'title' in chat ? chat.title : 'Selected Group';

      // Verify user is admin (Telegram usually guarantees via request_chat, but double-check)
      let member;
      try {
        member = await ctx.telegram.getChatMember(sharedChatId, userId);
      } catch (err: any) {
        const migrateId = err?.parameters?.migrate_to_chat_id;
        if (migrateId) {
          sharedChatId = migrateId;
          member = await ctx.telegram.getChatMember(sharedChatId, userId);
        } else {
          throw err;
        }
      }

      if (member.status !== 'creator' && member.status !== 'administrator') {
        await ctx.reply('❌ You must be an admin in the selected group.');
        return;
      }

      // Ensure bot is present and has permissions
      let botHasRights = false;
      try {
        const admins = await ctx.telegram.getChatAdministrators(sharedChatId);
        const botId = ctx.botInfo.id;
        botHasRights = admins.some((admin) => admin.user.id === botId);
      } catch (adminError) {
        logger.warn('Could not check bot admin rights for group:', adminError);
      }

      if (!botHasRights) {
        await ctx.reply(
          '⚠️ I need to be added as an admin in that group first.\n\n' +
            'Please add me with permissions to invite users, pin messages, and delete spam, then tap "Select Group" again.',
          { reply_markup: { remove_keyboard: true } }
        );
        return;
      }

      // Upsert the group in DB so later steps have it
      try {
        const savedGroup = await groupService.upsertGroup(chat as any);

        await conversationService.updateData(userId, chatId, {
          selectedGroupId: savedGroup.id,
          selectedGroupTelegramId: savedGroup.telegramId.toString(),
          groupTitle,
        });
      } catch (dbError) {
        logger.warn('Failed to upsert group during selection:', dbError);
      }

      await ctx.reply(`✅ Group selected: *${groupTitle}*\n\nNext: pick your portal channel.`, {
        parse_mode: 'Markdown',
        reply_markup: { remove_keyboard: true },
      });

      // Move to channel selection
      await conversationService.nextStep(userId, chatId, 'setup_select_channel');
      await showChannelSelection(ctx);
    } catch (error: any) {
      logger.error('Error handling shared group:', error);
      await ctx.reply('❌ Could not access that group. Make sure I am added as admin and try again.');
    }
  } catch (error) {
    logger.error('Error handling group shared:', error);
    await ctx.reply('❌ An error occurred. Please try again.');
  }
}

/**
 * Handle text input during setup (group selection, channel link/username, etc.)
 */
export async function handleSetupTextInput(ctx: SetupWizardContext) {
  try {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!userId || !chatId || !ctx.message || !('text' in ctx.message)) {
      return;
    }

    const state = await conversationService.getState(userId, chatId);
    if (!state) {
      return; // No active conversation
    }

    const text = ctx.message.text;

    // Handle cancel
    if (text === '❌ Cancel') {
      await conversationService.clearState(userId, chatId);
      await ctx.reply('❌ Setup cancelled. Use /setup to start again.', {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    // Handle group selection (step: setup_select_group)
    if (state.step === 'setup_select_group') {
      await ctx.reply(
        '👆 Please tap the *Select Group* button so Telegram can show your admin groups.\n' +
          'If you don\'t see the list, update Telegram and try again.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Handle buy bot token address input (step: buybot_enter_address)
    if (state.step === 'buybot_enter_address') {
      const tokenAddress = text.trim();
      const chain = state.data.selectedChain;
      const groupId = state.data.selectedGroupId;
      const groupTelegramId = state.data.selectedGroupTelegramId;

      if (!chain || !groupId) {
        await ctx.reply('❌ Session expired. Please start over with /setup');
        await conversationService.clearState(userId, chatId);
        return;
      }

      // Validate address format (basic validation)
      if (tokenAddress.length < 10) {
        await ctx.reply('❌ Invalid token address. Please send a valid token address.');
        return;
      }

      await ctx.reply('⏳ Adding token to your group...');

      try {
        // Get the group
        let group = null;
        if (groupTelegramId) {
          const tgId = Number(groupTelegramId);
          if (!Number.isNaN(tgId)) {
            group = await groupService.getGroupByTelegramId(tgId);
          }
        }
        if (!group && groupId) {
          group = await prisma.group.findUnique({ where: { id: groupId } });
        }
        if (!group) {
          await ctx.reply('❌ Group not found. Please start over with /setup');
          await conversationService.clearState(userId, chatId);
          return;
        }

        // For EVM chains, try to fetch the pair address automatically
        let pairAddress: string | undefined;
        const normalizedChain = chain.toLowerCase();

        // Import getPairAddress function if needed
        // Note: This should be available in the parent scope or imported

        // Add token with a default symbol (we'll let them customize later)
        const defaultSymbol = `TOKEN_${Date.now()}`;

        const token = await tokenService.addTrackedToken({
          groupId: group.id,
          chain: normalizedChain,
          tokenAddress: tokenAddress,
          tokenSymbol: defaultSymbol,
          tokenName: undefined,
          pairAddress,
          minAmount: 0,
        });

        // Store token info in state for customization
        await conversationService.setState(userId, chatId, 'buybot_customize', {
          selectedGroupId: groupId,
          tokenId: token.id,
          tokenSymbol: defaultSymbol,
          tokenAddress,
          chain,
        });

        await ctx.reply(
          '✅ *Buy Bot Activated!*\n\n' +
          `Chain: *${chain}*\n` +
          `Token Address: \`${tokenAddress}\`\n\n` +
          'The buy bot is now tracking this token in your group! 🎉\n\n' +
          'Customize your buy bot below:',
          {
            parse_mode: 'Markdown',
            reply_markup: { remove_keyboard: true },
            ...Markup.inlineKeyboard([
              [Markup.button.callback('💵 Set Minimum USD', 'buybot_set_minusd')],
              [Markup.button.callback('🔘 Add Custom Buttons', 'buybot_set_buttons')],
              [Markup.button.callback('😀 Set Emoji Tiers', 'buybot_set_emoji')],
              [Markup.button.callback('✅ Done', 'buybot_done')],
            ]),
          }
        );

        logger.info(`Buy bot activated for group ${groupId} - Chain: ${chain}, Address: ${tokenAddress}`);

        // Clear conversation state
        await conversationService.clearState(userId, chatId);
      } catch (error: any) {
        logger.error('Error adding token for buy bot:', error);
        await ctx.reply('❌ Failed to add token. Please try again or use `/addtoken` command in your group.');
        await conversationService.clearState(userId, chatId);
      }
      return;
    }

    // Handle channel selection (step: setup_portal_text or setup_select_channel)
    if (state.step === 'setup_portal_text' || state.step === 'setup_select_channel') {
      // Check if user selected from keyboard
      const channels = state.data.channels || [];
      const selectedChannel = channels.find((channel: any) => text === channel.title);

      let channelUsername: string;
      if (selectedChannel) {
        channelUsername = selectedChannel.username;
      } else {
        // Parse manually entered channel
        channelUsername = text.trim();

        if (channelUsername.includes('t.me/')) {
          const match = channelUsername.match(/t\.me\/([a-zA-Z0-9_]+)/);
          if (match) {
            channelUsername = '@' + match[1];
          }
        }

        if (!channelUsername.startsWith('@')) {
          channelUsername = '@' + channelUsername;
        }
      }

      // Validate channel
      try {
        const chat = await ctx.telegram.getChat(channelUsername);

        if (chat.type !== 'channel') {
          await ctx.reply('❌ This is not a channel. Please send a channel username or link.');
          return;
        }

        const admins = await ctx.telegram.getChatAdministrators(channelUsername);
        const botId = ctx.botInfo.id;
        const isBotAdmin = admins.some((admin) => admin.user.id === botId);

        if (!isBotAdmin) {
          await ctx.reply('❌ I am not an admin in this channel.\n\nPlease make me an admin and try again.');
          return;
        }

        await conversationService.updateData(userId, chatId, {
          channelId: chat.id.toString(),
          channelUsername,
          channelTitle: 'title' in chat ? chat.title : channelUsername,
        });

        await ctx.reply(
          '✅ Channel verified!\n\n' + `📢 *${('title' in chat ? chat.title : channelUsername)}*`,
          {
            parse_mode: 'Markdown',
            reply_markup: { remove_keyboard: true },
          }
        );

        await showPortalCustomization(ctx);
        await conversationService.nextStep(userId, chatId, 'setup_customize_portal');
      } catch (error: any) {
        logger.error('Error validating channel:', error);
        await ctx.reply('❌ Channel not found or I cannot access it. Please check and try again.');
      }
      return;
    }
  } catch (error) {
    logger.error('Error handling setup text input:', error);
    await ctx.reply('❌ An error occurred. Please try again.');
  }
}

/**
 * Show portal customization menu
 */
async function showPortalCustomization(ctx: SetupWizardContext) {
  await ctx.reply(
    '⚙️ *Portal setup is almost complete!*\n\n' +
      'Customize your portal to your liking and press \'Create Portal\' to make the portal',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🖼️ Add Media', 'setup_add_media')],
        [Markup.button.callback('📝 Change Text', 'setup_change_text')],
        [Markup.button.callback('🔘 Add Buttons', 'setup_add_buttons')],
        [Markup.button.callback('✅ Create Portal', 'setup_create_portal')],
        [Markup.button.callback('❌ Cancel', 'setup_cancel')],
      ]),
    }
  );
}

/**
 * Handle portal customization actions
 */
export async function handlePortalCustomization(ctx: SetupWizardContext) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      return;
    }

    await ctx.answerCbQuery();
    // For now, just show the customization menu again
    // TODO: Implement actual customization handlers
    await showPortalCustomization(ctx);
  } catch (error) {
    logger.error('Error handling portal customization:', error);
  }
}

/**
 * Complete portal setup and show buy bot option
 */
export async function completePortalSetup(ctx: SetupWizardContext) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      return;
    }

    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!userId || !chatId) {
      return;
    }

    const state = await conversationService.getState(userId, chatId);
    if (!state) {
      await ctx.answerCbQuery('❌ Session expired. Please start again with /setup');
      return;
    }

    const groupId = state.data.selectedGroupId;
    const channelId = state.data.channelId;
    const channelUsername = state.data.channelUsername;

    if (!groupId || !channelId || !channelUsername) {
      await ctx.answerCbQuery('❌ Missing portal configuration data. Please start over.');
      return;
    }

    await ctx.answerCbQuery('⏳ Creating portal...');

    try {
      const portal = await portalService.createOrUpdatePortal({
        groupId,
        channelId: BigInt(channelId),
        channelUsername,
        headerText: state.data.headerText || '🛡️ Welcome to the Group!',
        description: state.data.description || 'Complete verification to join our community.',
        botUsername: ctx.botInfo?.username,
      });

      logger.info(`Portal created: ${portal.id} for group ${groupId}`);

      await portalService.revokePublicInviteLinks(groupId, ctx);
      await portalService.updatePortalMessage(portal.id, ctx);

      // Show success message with buy bot option
      await ctx.editMessageText(
        '🔰 *Your portal has been created!*\n\n' +
          'Click below to setup the #1 Buy Bot — Featuring 6 Chains, multiple pairs, and Qualify for SOL / ETH Trending (https://t.me/trending/14) 💎',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('🎯 Setup Buy Bot', 'setup_buy_bot')]]),
        }
      );

      // Don't clear state yet - we need groupId for buy bot setup
      // Just update the state to keep only the groupId
      await conversationService.setState(userId, chatId, 'portal_created', {
        selectedGroupId: groupId,
      });
    } catch (error) {
      logger.error('Error creating portal:', error);
      await ctx.editMessageText('❌ *Portal Creation Failed*\n\nPlease try again with /setup', {
        parse_mode: 'Markdown',
      });
    }
  } catch (error) {
    logger.error('Error completing portal setup:', error);
  }
}

/**
 * Cancel setup wizard
 */
export async function cancelSetupWizard(ctx: SetupWizardContext) {
  try {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (userId && chatId) {
      await conversationService.clearState(userId, chatId);
    }

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('Setup cancelled');
      await ctx.editMessageText('❌ Setup cancelled. Use /setup to start again.');
    } else {
      await ctx.reply('❌ Setup cancelled. Use /setup to start again.', {
        reply_markup: { remove_keyboard: true },
      });
    }
  } catch (error) {
    logger.error('Error cancelling setup:', error);
  }
}

/**
 * Get groups where user is admin and bot is present
 */
async function getUserAdminGroups(
  ctx: Context
): Promise<Array<{ id: string; title: string; memberCount: number }>> {
  try {
    if (!ctx.from) {
      return [];
    }

    const groups = await groupService.getActiveGroups();
    if (!groups || groups.length === 0) {
      return [];
    }

    const adminGroups: Array<{ id: string; title: string; memberCount: number }> = [];

    for (const group of groups) {
      try {
        const member = await ctx.telegram.getChatMember(Number(group.telegramId), ctx.from.id);

        if (member.status === 'creator' || member.status === 'administrator') {
          let memberCount = 0;
          try {
            memberCount = await ctx.telegram.getChatMembersCount(Number(group.telegramId));
          } catch (err) {
            // Ignore
          }

          adminGroups.push({
            id: group.telegramId.toString(),
            title: group.title || 'Unknown Group',
            memberCount,
          });
        }
      } catch (error) {
        logger.debug(`Could not check admin status for group ${group.telegramId}`);
      }
    }

    return adminGroups;
  } catch (error) {
    logger.error('Error getting user admin groups:', error);
    return [];
  }
}

/**
 * Get channels where user is admin and bot is present
 */
async function getUserAdminChannels(
  ctx: Context
): Promise<Array<{ id: string; title: string; username: string }>> {
  // TODO: Implement channel detection
  // For now, return empty array to force manual input
  return [];
}

/**
 * Dispatch handler for chat_shared (groups/channels)
 */
export async function handleChatShared(ctx: SetupWizardContext) {
  if (!ctx.message || !('chat_shared' in ctx.message)) {
    return;
  }

  const requestId = ctx.message.chat_shared.request_id;
  if (requestId === 1) {
    return handleChannelShared(ctx);
  }
  if (requestId === 2) {
    return handleGroupShared(ctx);
  }
}

export default {
  startSetupWizard,
  handleSetupTextInput,
  handleChannelShared,
  handleGroupShared,
  handleChatShared,
  handlePortalCustomization,
  completePortalSetup,
  cancelSetupWizard,
};
