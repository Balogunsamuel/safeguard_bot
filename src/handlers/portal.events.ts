/**
 * Portal System Event Handlers
 *
 * This file contains event handlers for join events, messages, and callbacks.
 */

import { Context } from 'telegraf';
import logger from '../utils/logger';
import prisma from '../utils/database';
import {
  verificationService,
  trustLevelService,
  spamControlService,
  scamBlockerService,
  antiRaidService,
  portalService,
} from '../services';

/**
 * Handle new members joining
 */
export async function handleNewChatMembers(ctx: Context) {
  try {
    if (!('new_chat_members' in ctx.message!)) return;

    const groupId = ctx.chat!.id.toString();
    const newMembers = ctx.message.new_chat_members!;

    for (const member of newMembers) {
      if (member.is_bot) continue; // Skip bots

      const telegramUserId = BigInt(member.id);

      // Track join for anti-raid detection
      const raidResult = await antiRaidService.trackJoin(groupId, telegramUserId);

      if (raidResult.isRaid) {
        // Raid detected!
        await ctx.reply(
          `🚨 **RAID DETECTED!**\n\n` +
          `${raidResult.joinCount} joins in ${raidResult.timeWindow} seconds.\n` +
          `🔒 Lockdown enabled for 30 minutes.\n\n` +
          `New members will be restricted until lockdown ends.`,
          { parse_mode: 'Markdown' }
        );

        logger.warn(
          `Raid detected in group ${groupId}: ${raidResult.joinCount} joins`
        );

        continue; // Skip further processing during raid
      }

      // Get or create user in database
      let user = await prisma.user.findUnique({
        where: { telegramId: telegramUserId },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            telegramId: telegramUserId,
            username: member.username,
            firstName: member.first_name,
            lastName: member.last_name,
          },
        });
      }

      // Check if group has portal configured
      const portal = await portalService.getPortalByGroupId(groupId);

      if (portal && portal.isActive) {
        // Portal is active - check if user has valid invite link
        try {
          // Check if user has a valid (unused, not revoked) invite link
          const inviteLink = await prisma.inviteLink.findFirst({
            where: {
              portalId: portal.id,
              createdFor: telegramUserId,
              isUsed: false,
              isRevoked: false,
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date() } }
              ],
            },
            orderBy: {
              createdAt: 'desc', // Get the most recent valid link
            },
          });

          if (inviteLink) {
            // User has verified! Mark invite link as used
            await portalService.markInviteLinkUsed(inviteLink.inviteLink, telegramUserId);

            // Initialize trust level
            await trustLevelService.initializeTrustLevel(user.id, groupId);
            const trustInfo = await trustLevelService.getTrustLevel(user.id, groupId);

            // Welcome the verified user
            await ctx.reply(
              `✅ **Welcome ${member.first_name}!**\n\n` +
              `You've successfully verified and joined the group.\n\n` +
              `You're starting at ${trustInfo?.emoji} ${trustInfo?.levelName}.\n` +
              `Be active and follow the rules to level up! 📈`,
              { parse_mode: 'Markdown' }
            );

            logger.info(`Verified user ${member.id} joined using invite link ${inviteLink.id}`);
          } else {
            // User joined without a valid invite link (bypassing portal!)
            // This should not happen if public links are properly revoked
            logger.warn(`User ${member.id} joined group ${groupId} without valid invite link!`);

            // Ban the user immediately
            try {
              await ctx.banChatMember(member.id);

              await ctx.reply(
                `🚫 **Unauthorized Join Detected**\n\n` +
                `User ${member.first_name} was removed for bypassing verification.\n\n` +
                `**Important:** Make sure all public invite links are revoked!`,
                { parse_mode: 'Markdown' }
              );

              logger.info(`Banned user ${member.id} for bypassing portal verification`);
            } catch (banError) {
              logger.error(`Error banning unauthorized user ${member.id}:`, banError);

              // If we can't ban, at least restrict them
              await ctx.telegram.restrictChatMember(ctx.chat!.id, member.id, {
                permissions: {
                  can_send_messages: false,
                  can_send_audios: false,
                  can_send_documents: false,
                  can_send_photos: false,
                  can_send_videos: false,
                  can_send_video_notes: false,
                  can_send_voice_notes: false,
                  can_send_polls: false,
                  can_send_other_messages: false,
                  can_add_web_page_previews: false,
                  can_change_info: false,
                  can_invite_users: false,
                  can_pin_messages: false,
                },
              });

              await ctx.reply(
                `⚠️ **Unauthorized join detected**\n\n` +
                `User ${member.first_name} has been restricted.\n\n` +
                `Please verify through the portal channel first!`,
                { parse_mode: 'Markdown' }
              );
            }
          }
        } catch (error: any) {
          logger.error(`Error processing new member ${member.id} in portal group:`, error);

          await ctx.reply(
            `⚠️ **Error processing new member.**\n\n` +
            `Please contact an administrator.`,
            { parse_mode: 'Markdown' }
          );
        }
      } else {
        // No portal - just initialize trust level and welcome
        try {
          await trustLevelService.initializeTrustLevel(user.id, groupId);
          const trustInfo = await trustLevelService.getTrustLevel(user.id, groupId);

          await ctx.reply(
            `👋 Welcome ${member.first_name}!\n\n` +
            `You're starting at ${trustInfo?.emoji} ${trustInfo?.levelName}.\n` +
            `Be active and follow the rules to level up! 📈`,
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          logger.error(`Error initializing trust level for user ${member.id}:`, error);
        }
      }
    }
  } catch (error) {
    logger.error('Error handling new chat members:', error);
  }
}

/**
 * Handle messages for spam/scam filtering
 */
export async function handleMessage(ctx: Context) {
  try {
    // Skip private chats
    if (ctx.chat?.type === 'private') return;

    // Skip if no text
    const text = 'text' in ctx.message! ? ctx.message.text :
                 'caption' in ctx.message! ? ctx.message.caption : '';

    if (!text) return;

    const groupId = ctx.chat!.id.toString();
    const telegramUserId = BigInt(ctx.from!.id);

    // Auto-register group if not in database
    try {
      const existingGroup = await prisma.group.findUnique({
        where: { telegramId: BigInt(groupId) },
      });

      if (!existingGroup && ctx.chat && 'title' in ctx.chat) {
        await prisma.group.create({
          data: {
            telegramId: BigInt(groupId),
            title: ctx.chat.title,
            type: ctx.chat.type, // 'group', 'supergroup', or 'channel'
            isActive: true,
          },
        });
        logger.info(`Auto-registered group: ${ctx.chat.title} (${groupId})`);
      }
    } catch (error) {
      logger.error('Error auto-registering group:', error);
    }

    // Get or create user
    let user = await prisma.user.findUnique({
      where: { telegramId: telegramUserId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: telegramUserId,
          username: ctx.from!.username,
          firstName: ctx.from!.first_name,
          lastName: ctx.from!.last_name,
        },
      });

      // Initialize trust level for new user
      await trustLevelService.initializeTrustLevel(user.id, groupId);
    }

    // Get trust level
    let trustLevel = await trustLevelService.getTrustLevel(user.id, groupId);

    if (!trustLevel) {
      // Initialize if missing
      await trustLevelService.initializeTrustLevel(user.id, groupId);
      trustLevel = await trustLevelService.getTrustLevel(user.id, groupId);
      if (!trustLevel) return; // Fail gracefully
    }

    // Check if user is muted
    const isMuted = await trustLevelService.isMuted(user.id, groupId);
    if (isMuted) {
      try {
        await ctx.deleteMessage();
      } catch (error) {
        logger.warn('Failed to delete message from muted user:', error);
      }
      return;
    }

    // Check spam
    const spamResult = await spamControlService.checkMessage(
      groupId,
      user.id,
      telegramUserId,
      text,
      trustLevel.level
    );

    if (spamResult.isSpam) {
      if (spamResult.action === 'delete' || spamResult.action === 'mute') {
        try {
          await ctx.deleteMessage();

          if (spamResult.shouldNotify) {
            const notifyMsg = await ctx.reply(
              `⚠️ Message deleted: ${spamResult.reason}`
            );

            // Auto-delete notification after 5 seconds
            setTimeout(async () => {
              try {
                await ctx.telegram.deleteMessage(ctx.chat!.id, notifyMsg.message_id);
              } catch (e) {
                // Ignore errors
              }
            }, 5000);
          }

          if (spamResult.action === 'mute') {
            await spamControlService.handleSpamViolation(
              groupId,
              user.id,
              telegramUserId,
              spamResult
            );

            await ctx.reply(
              `🔇 User muted for spam: ${spamResult.reason}\n\n` +
              `This is an automatic action.`
            );
          }
        } catch (error) {
          logger.warn('Failed to handle spam message:', error);
        }
      }

      return;
    }

    // Check scam
    const scamResult = await scamBlockerService.checkMessage(
      groupId,
      text,
      trustLevel.level
    );

    if (scamResult.isScam) {
      if (scamResult.shouldDelete) {
        try {
          await ctx.deleteMessage();

          if (scamResult.shouldBan) {
            await ctx.banChatMember(ctx.from!.id);
            await ctx.reply(
              `🚫 **User banned for scam attempt**\n\n` +
              `**Reason:** ${scamResult.description}\n` +
              `**Severity:** ${scamResult.severity}`,
              { parse_mode: 'Markdown' }
            );
          } else {
            await ctx.reply(
              `⚠️ **Scam content detected and removed**\n\n` +
              `**Type:** ${scamResult.type}\n` +
              `**Reason:** ${scamResult.description}`,
              { parse_mode: 'Markdown' }
            );
          }
        } catch (error) {
          logger.warn('Failed to handle scam message:', error);
        }
      }

      return;
    }

    // All checks passed - track message activity
    await trustLevelService.incrementMessageCount(user.id, groupId);
  } catch (error) {
    logger.error('Error handling message:', error);
  }
}

/**
 * Handle verification button click
 */
export async function handleVerifyCallback(ctx: Context) {
  try {
    if (!('data' in ctx.callbackQuery!)) return;

    const data = ctx.callbackQuery.data!;
    const match = data.match(/^verify_(.+)$/);

    if (!match) return;

    const portalId = match[1];
    const botUsername = ctx.botInfo?.username;

    await ctx.answerCbQuery();

    if (!botUsername) {
      await ctx.reply('❌ Unable to start verification. Please DM the bot directly.');
      return;
    }

    const deepLink = `https://t.me/${botUsername}?start=verify_${portalId}`;
    await ctx.reply(
      '🔐 Tap below to verify in DM. Premium users get instant access; others tap "I am human" in DM to get the link.',
      {
        reply_markup: {
          inline_keyboard: [[{ text: '✅ Open bot to verify', url: deepLink }]],
        },
        disable_web_page_preview: true,
      }
    );
  } catch (error) {
    logger.error('Error handling verify callback:', error);
    await ctx.answerCbQuery('❌ Verification failed');
  }
}

/**
 * Handle challenge answer
 */
export async function handleAnswerCallback(ctx: Context) {
  try {
    if (!('data' in ctx.callbackQuery!)) return;

    const data = ctx.callbackQuery.data!;
    const match = data.match(/^answer_(.+?)_(.+)$/);

    if (!match) return;

    const attemptId = match[1];
    const answer = match[2];
    const userId = ctx.from!.id;

    // Verify answer
    const result = await verificationService.verifyAnswer(attemptId, answer);

    if (result.success) {
      await ctx.answerCbQuery('✅ Correct!');

      // Get verification attempt to find the portal
      const attempt = await prisma.verificationAttempt.findUnique({
        where: { id: attemptId },
        include: { portal: true },
      });

      if (attempt && attempt.portal) {
        try {
          // Generate one-time invite link for the verified user
          const inviteLink = await portalService.generateInviteLink(
            attempt.portal.groupId,
            attempt.portal.id,
            BigInt(userId),
            ctx
          );

          logger.info(`Generated invite link for verified user ${userId}: ${inviteLink.inviteLink}`);

          // Get group info for the message
          const group = await prisma.group.findUnique({
            where: { id: attempt.portal.groupId },
          });

          const groupTitle = group?.title || 'the group';

          // Send link in channel (reply) and PM as fallback
          const linkMessage =
            `✅ **Verification Successful!**\n\n` +
            `Join **${groupTitle}** with this one-time link:\n` +
            `${inviteLink.inviteLink}\n\n` +
            `⚠️ Single use. Do not share.`;

          try {
            await ctx.reply(linkMessage, { parse_mode: 'Markdown' });
          } catch (sendError) {
            logger.warn('Could not send link in chat:', sendError);
          }

          try {
            await ctx.telegram.sendMessage(userId, linkMessage, { parse_mode: 'Markdown' });
          } catch (pmError: any) {
            logger.warn(`Could not PM user ${userId}:`, pmError);
          }

          // Update the challenge message to success
          await ctx.editMessageText(
            `✅ **Verification Successful!**\n\n` +
            `Link posted above. If you missed it, request verification again.`,
            { parse_mode: 'Markdown' }
          );

        } catch (error: any) {
          logger.error('Error generating invite link for verified user:', error);
          await ctx.editMessageText(
            `✅ **Verification Successful!**\n\n` +
            `However, there was an error generating your invite link.\n\n` +
            `Please contact an administrator.`,
            { parse_mode: 'Markdown' }
          );
        }
      }
    } else {
      await ctx.answerCbQuery(`❌ ${result.error}`);

      if (result.attemptsRemaining && result.attemptsRemaining > 0) {
        await ctx.reply(
          `❌ Incorrect answer.\n\n` +
          `You have **${result.attemptsRemaining}** attempt(s) remaining.\n\n` +
          `Try again!`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.editMessageText(
          '❌ **Verification Failed**\n\n' +
          'You have exceeded the maximum number of attempts.\n' +
          'Please try again later.'
        );
      }
    }
  } catch (error) {
    logger.error('Error handling answer callback:', error);
    await ctx.answerCbQuery('❌ Verification failed');
  }
}
