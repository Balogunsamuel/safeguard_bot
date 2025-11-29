/**
 * Portal System Handlers
 *
 * This file contains all handlers for the Safeguard-style portal system.
 */

import { Context } from 'telegraf';
import logger from '../utils/logger';
import prisma from '../utils/database';
import {
  portalService,
  verificationService,
  trustLevelService,
  spamControlService,
  scamBlockerService,
  antiRaidService,
} from '../services';

/**
 * Check if user is admin in chat
 */
export async function isAdmin(ctx: Context): Promise<boolean> {
  if (!ctx.chat || !ctx.from) return false;

  try {
    if (ctx.chat.type === 'private') return true;

    const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
    return member.status === 'creator' || member.status === 'administrator';
  } catch (error) {
    logger.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * Portal setup wizard command
 */
export async function handleSetupCommand(ctx: Context) {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply('❌ Only admins can use this command.');
    }

    if (ctx.chat?.type === 'private') {
      return ctx.reply('❌ This command must be used in a group.');
    }

    const groupId = ctx.chat!.id.toString();

    // Check if portal already exists
    const existingPortal = await portalService.getPortalByGroupId(groupId);

    if (existingPortal) {
      return ctx.reply(
        '✅ Portal already configured for this group!\n\n' +
        'Use /portalconfig to modify settings.\n' +
        'Use /updateportal to update the portal message.'
      );
    }

    await ctx.reply(
      '🛡️ **Portal Setup Wizard**\n\n' +
      'To set up a verification portal for this group:\n\n' +
      '1️⃣ Create a public channel (your portal)\n' +
      '2️⃣ Add me as admin in both the channel and this group\n' +
      '3️⃣ Send me the channel username (e.g., @mychannel)\n\n' +
      '💡 Tip: Make sure I have "Invite Users" permission in the group!',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error in setup command:', error);
    await ctx.reply('❌ Failed to start setup. Please try again.');
  }
}

/**
 * Trust level command
 */
export async function handleTrustLevelCommand(ctx: Context) {
  try {
    if (ctx.chat?.type === 'private') {
      return ctx.reply('❌ This command must be used in a group.');
    }

    const groupId = ctx.chat!.id.toString();

    // Get target user (reply or self)
    let targetUserId: bigint;
    let targetName: string;

    if ('reply_to_message' in ctx.message! && ctx.message.reply_to_message) {
      targetUserId = BigInt(ctx.message.reply_to_message.from!.id);
      targetName = ctx.message.reply_to_message.from!.first_name;
    } else {
      targetUserId = BigInt(ctx.from!.id);
      targetName = ctx.from!.first_name;
    }

    const user = await prisma.user.findUnique({
      where: { telegramId: targetUserId },
    });

    if (!user) {
      return ctx.reply('❌ User not found in database.');
    }

    const trustInfo = await trustLevelService.getTrustLevel(user.id, groupId);

    if (!trustInfo) {
      return ctx.reply('❌ User has no trust level in this group.');
    }

    const daysInGroup = Math.floor(
      (Date.now() - trustInfo.joinedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    await ctx.reply(
      `${trustInfo.emoji} **${targetName}'s Trust Level**\n\n` +
      `**Level:** ${trustInfo.levelName}\n` +
      `**Joined:** ${daysInGroup} days ago\n` +
      `**Messages:** ${trustInfo.messageCount}\n` +
      `**Warnings:** ${trustInfo.warningCount}\n\n` +
      `${trustInfo.canBePromoted ? '✅ Eligible for promotion!' : '⏳ Keep being active to level up!'}\n\n` +
      `${trustInfo.description}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error in trustlevel command:', error);
    await ctx.reply('❌ Failed to get trust level.');
  }
}

/**
 * Promote user command
 */
export async function handlePromoteCommand(ctx: Context) {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply('❌ Only admins can use this command.');
    }

    if (!('reply_to_message' in ctx.message!) || !ctx.message.reply_to_message) {
      return ctx.reply('❌ Reply to a user to promote them.');
    }

    if (ctx.chat?.type === 'private') {
      return ctx.reply('❌ This command must be used in a group.');
    }

    const groupId = ctx.chat!.id.toString();
    const targetUserId = BigInt(ctx.message.reply_to_message.from!.id);

    const user = await prisma.user.findUnique({
      where: { telegramId: targetUserId },
    });

    if (!user) {
      return ctx.reply('❌ User not found.');
    }

    const success = await trustLevelService.promoteUser(user.id, groupId, true);

    if (success) {
      await ctx.reply('✅ User promoted to next trust level!');
    } else {
      await ctx.reply('❌ Failed to promote user (already at max level?)');
    }
  } catch (error) {
    logger.error('Error in promote command:', error);
    await ctx.reply('❌ Failed to promote user.');
  }
}

/**
 * Demote user command
 */
export async function handleDemoteCommand(ctx: Context) {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply('❌ Only admins can use this command.');
    }

    if (!('reply_to_message' in ctx.message!) || !ctx.message.reply_to_message) {
      return ctx.reply('❌ Reply to a user to demote them.');
    }

    if (ctx.chat?.type === 'private') {
      return ctx.reply('❌ This command must be used in a group.');
    }

    const groupId = ctx.chat!.id.toString();
    const targetUserId = BigInt(ctx.message.reply_to_message.from!.id);

    const user = await prisma.user.findUnique({
      where: { telegramId: targetUserId },
    });

    if (!user) {
      return ctx.reply('❌ User not found.');
    }

    const success = await trustLevelService.demoteUser(user.id, groupId, 'Manual demotion by admin');

    if (success) {
      await ctx.reply('✅ User demoted to previous trust level.');
    } else {
      await ctx.reply('❌ Failed to demote user (already at minimum level?)');
    }
  } catch (error) {
    logger.error('Error in demote command:', error);
    await ctx.reply('❌ Failed to demote user.');
  }
}

/**
 * End raid lockdown command
 */
export async function handleEndLockdownCommand(ctx: Context) {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply('❌ Only admins can use this command.');
    }

    if (ctx.chat?.type === 'private') {
      return ctx.reply('❌ This command must be used in a group.');
    }

    const groupId = ctx.chat!.id.toString();
    const adminUserId = BigInt(ctx.from!.id);

    const isInLockdown = await antiRaidService.isInLockdown(groupId);

    if (!isInLockdown) {
      return ctx.reply('✅ Group is not in lockdown.');
    }

    const success = await antiRaidService.endLockdown(groupId, adminUserId);

    if (success) {
      await ctx.reply('✅ Lockdown ended. Group returned to normal mode.');
    } else {
      await ctx.reply('❌ Failed to end lockdown.');
    }
  } catch (error) {
    logger.error('Error in endlockdown command:', error);
    await ctx.reply('❌ Failed to end lockdown.');
  }
}

/**
 * Spam config command
 */
export async function handleSpamConfigCommand(ctx: Context) {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply('❌ Only admins can use this command.');
    }

    if (ctx.chat?.type === 'private') {
      return ctx.reply('❌ This command must be used in a group.');
    }

    const groupId = ctx.chat!.id.toString();
    const args = 'text' in ctx.message! ? ctx.message.text!.split(' ').slice(1) : [];

    if (args.length === 0) {
      // Show current config
      const config = await spamControlService.getSpamConfig(groupId);
      const portal = await prisma.portal.findUnique({ where: { groupId } });

      if (!config) {
        return ctx.reply('❌ Spam control not configured.');
      }

      await ctx.reply(
        '🛡️ **Spam Control Settings**\n\n' +
        `**Mode:** ${portal?.spamMode || 'standard'}\n` +
        `**Block URLs:** ${config.blockUrls ? '✅' : '❌'}\n` +
        `**Block Telegram Links:** ${config.blockTelegramLinks ? '✅' : '❌'}\n` +
        `**Block Contracts:** ${config.blockContractAddresses ? '✅' : '❌'}\n` +
        `**Max Messages/Min:** ${config.maxMessagesPerMinute}\n` +
        `**Max Messages/Hour:** ${config.maxMessagesPerHour}\n` +
        `**Auto-Mute After:** ${config.autoMuteAfterWarnings} warnings\n\n` +
        'Use: /spamconfig <setting> <value>',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Update config
    const setting = args[0].toLowerCase();
    const value = args[1];

    if (setting === 'mode') {
      const validModes = ['off', 'standard', 'strict', 'anti_raid'];
      if (!validModes.includes(value)) {
        return ctx.reply(`❌ Invalid mode. Use: ${validModes.join(', ')}`);
      }

      await spamControlService.setSpamMode(groupId, value as any);
      await ctx.reply(`✅ Spam mode set to: ${value}`);
    } else {
      await ctx.reply('❌ Unknown setting. Use /spamconfig to see current settings.');
    }
  } catch (error) {
    logger.error('Error in spamconfig command:', error);
    await ctx.reply('❌ Failed to configure spam control.');
  }
}

/**
 * Portal stats command
 */
export async function handlePortalStatsCommand(ctx: Context) {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply('❌ Only admins can use this command.');
    }

    if (ctx.chat?.type === 'private') {
      return ctx.reply('❌ This command must be used in a group.');
    }

    const groupId = ctx.chat!.id.toString();

    const portal = await portalService.getPortalByGroupId(groupId);

    if (!portal) {
      return ctx.reply('❌ No portal configured for this group. Use /setup to create one.');
    }

    const stats = await portalService.getPortalStats(portal.id);
    const trustStats = await trustLevelService.getGroupStats(groupId);
    const raidStats = await antiRaidService.getRaidStats(groupId);

    if (!stats || !trustStats) {
      return ctx.reply('❌ Failed to fetch statistics.');
    }

    await ctx.reply(
      '📊 **Portal Statistics**\n\n' +
      `**Verifications:**\n` +
      `• Total: ${stats.verifications.total}\n` +
      `• Successful: ${stats.verifications.successful}\n` +
      `• Failed: ${stats.verifications.failed}\n` +
      `• Success Rate: ${stats.verifications.successRate}%\n\n` +
      `**Invite Links:**\n` +
      `• Total Generated: ${stats.inviteLinks.total}\n` +
      `• Used: ${stats.inviteLinks.used}\n` +
      `• Active: ${stats.inviteLinks.active}\n\n` +
      `**Trust Levels:**\n` +
      `• 🆕 New: ${trustStats.byLevel.new}\n` +
      `• ✅ Trusted: ${trustStats.byLevel.trusted}\n` +
      `• ⭐ VIP: ${trustStats.byLevel.vip}\n` +
      `• 🔇 Muted: ${trustStats.muted}\n` +
      `• ⚠️ Warned: ${trustStats.warned}\n\n` +
      `**Anti-Raid:**\n` +
      `• Total Raids: ${raidStats?.totalRaids || 0}\n` +
      `• Currently Locked: ${raidStats?.isCurrentlyInLockdown ? '🔒 Yes' : '✅ No'}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error in portalstats command:', error);
    await ctx.reply('❌ Failed to fetch statistics.');
  }
}

/**
 * Initialize scam patterns command (one-time setup)
 */
export async function handleInitScamPatternsCommand(ctx: Context) {
  try {
    if (!(await isAdmin(ctx))) {
      return ctx.reply('❌ Only admins can use this command.');
    }

    await ctx.reply('🔄 Initializing scam detection patterns...');

    await scamBlockerService.initializeScamPatterns();

    const stats = await scamBlockerService.getScamStats();

    await ctx.reply(
      `✅ Scam patterns initialized!\n\n` +
      `**Total Patterns:** ${stats?.total || 0}\n` +
      `**Active:** ${stats?.active || 0}\n\n` +
      `**By Type:**\n` +
      `• URLs: ${stats?.byType.url || 0}\n` +
      `• Keywords: ${stats?.byType.keyword || 0}\n` +
      `• Telegram Links: ${stats?.byType.telegram_link || 0}\n` +
      `• Contracts: ${stats?.byType.contract || 0}\n` +
      `• Unicode: ${stats?.byType.unicode || 0}`
    );
  } catch (error) {
    logger.error('Error initializing scam patterns:', error);
    await ctx.reply('❌ Failed to initialize scam patterns.');
  }
}
