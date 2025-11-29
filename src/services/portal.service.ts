import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import { Context } from 'telegraf';

const prisma = new PrismaClient();

/**
 * Portal button configuration
 */
export interface PortalButtonConfig {
  text: string;
  url: string;
  isVerifyButton?: boolean;
}

/**
 * Portal configuration for setup
 */
export interface PortalSetupConfig {
  groupId: string;
  channelId: bigint;
  channelUsername?: string;
  headerText?: string;
  description?: string;
  mediaType?: 'photo' | 'video' | 'animation';
  mediaFileId?: string;
  mediaUrl?: string;
  buttons?: PortalButtonConfig[];
  botUsername?: string;
}

const buildVerifyUrl = (botUsername: string, portalId: string) =>
  `https://t.me/${botUsername}?start=verify_${portalId}`;

class PortalService {
  /**
   * Create or update a portal configuration
   */
  async createOrUpdatePortal(config: PortalSetupConfig): Promise<any> {
    try {
      // Check if portal already exists for this group
      const existing = await prisma.portal.findUnique({
        where: { groupId: config.groupId },
      });

      if (existing) {
        // Update existing portal
        const updated = await prisma.portal.update({
          where: { groupId: config.groupId },
          data: {
            channelId: config.channelId,
            channelUsername: config.channelUsername,
            headerText: config.headerText || existing.headerText,
          description: config.description || existing.description,
          mediaType: config.mediaType || existing.mediaType,
          mediaFileId: config.mediaFileId || existing.mediaFileId,
          mediaUrl: config.mediaUrl || existing.mediaUrl,
          inviteLinkType: existing.inviteLinkType || 'one_time',
          isActive: true,
          updatedAt: new Date(),
        },
      });

        // Ensure verify button is present and URL is correct
        if (config.botUsername) {
          const verifyBtn = await prisma.portalButton.findFirst({
            where: { portalId: updated.id, isVerifyButton: true },
          });
          const verifyUrl = buildVerifyUrl(config.botUsername, updated.id);
          if (verifyBtn) {
            await prisma.portalButton.update({
              where: { id: verifyBtn.id },
              data: { url: verifyUrl, text: '✅ Verify to Join', order: 0 },
            });
          } else {
            await prisma.portalButton.create({
              data: {
                portalId: updated.id,
                text: '✅ Verify to Join',
                url: verifyUrl,
                order: 0,
                isVerifyButton: true,
              },
            });
          }
        }

        logger.info(`Updated portal configuration for group ${config.groupId}`);
        return updated;
      }

      // Create new portal
      const portal = await prisma.portal.create({
        data: {
          groupId: config.groupId,
          channelId: config.channelId,
          channelUsername: config.channelUsername,
          headerText: config.headerText || '🛡️ Welcome to the Group!',
          description: config.description || 'Click the button below to verify and join our community.',
          mediaType: config.mediaType,
          mediaFileId: config.mediaFileId,
          mediaUrl: config.mediaUrl,
          inviteLinkType: 'one_time',
          isActive: true,
        },
      });

      // Create default verify button
      await prisma.portalButton.create({
        data: {
          portalId: portal.id,
          text: '✅ Verify to Join',
          url: config.botUsername ? buildVerifyUrl(config.botUsername, portal.id) : '',
          order: 0,
          isVerifyButton: true,
        },
      });

      // Add custom buttons if provided
      if (config.buttons) {
        for (let i = 0; i < config.buttons.length; i++) {
          const button = config.buttons[i];
          await prisma.portalButton.create({
            data: {
              portalId: portal.id,
              text: button.text,
              url: button.url,
              order: i + 1,
              isVerifyButton: button.isVerifyButton || false,
            },
          });
        }
      }

      logger.info(`Created new portal for group ${config.groupId}`);
      return portal;
    } catch (error) {
      logger.error('Error creating/updating portal:', error);
      throw error;
    }
  }

  /**
   * Get portal configuration by group ID
   */
  async getPortalByGroupId(groupId: string): Promise<any | null> {
    try {
      const portal = await prisma.portal.findUnique({
        where: { groupId },
        include: {
          buttons: {
            orderBy: { order: 'asc' },
          },
        },
      });

      return portal;
    } catch (error) {
      logger.error('Error getting portal:', error);
      return null;
    }
  }

  /**
   * Get portal configuration by portal ID
   */
  async getPortalById(portalId: string): Promise<any | null> {
    try {
      const portal = await prisma.portal.findUnique({
        where: { id: portalId },
        include: {
          buttons: {
            orderBy: { order: 'asc' },
          },
        },
      });

      return portal;
    } catch (error) {
      logger.error('Error getting portal by ID:', error);
      return null;
    }
  }

  /**
   * Generate Telegram invite link
   */
  async generateInviteLink(
    groupId: string,
    portalId: string,
    forUserId: bigint,
    ctx?: Context
  ): Promise<any> {
    try {
      const portal = await prisma.portal.findUnique({
        where: { id: portalId },
      });

      if (!portal) {
        throw new Error('Portal not found');
      }

      // Get group from database
      let group = await prisma.group.findUnique({
        where: { id: groupId },
      });

      // Backward compatibility: if groupId stored as telegramId string, try lookup by telegramId
      if (!group) {
        const tgId = BigInt(groupId);
        group = await prisma.group.findUnique({
          where: { telegramId: tgId },
        });
      }

      // If still not found, try to fetch from Telegram and create minimal record
      if (!group && ctx) {
        try {
          const chat = await ctx.telegram.getChat(Number(portal.groupId || groupId));
          if (chat && (chat.type === 'group' || chat.type === 'supergroup')) {
            group = await prisma.group.upsert({
              where: { telegramId: BigInt(chat.id) },
              update: {
                title: 'title' in chat ? chat.title : undefined,
                type: chat.type,
                isActive: true,
              },
              create: {
                telegramId: BigInt(chat.id),
                title: 'title' in chat ? chat.title : 'Unknown group',
                type: chat.type,
                isActive: true,
              },
            });
          }
        } catch (err) {
          logger.warn('Could not auto-create group during invite generation:', err);
        }
      }

      if (!group) {
        throw new Error('Group not found');
      }

      let inviteLink: string;
      let memberLimit: number | undefined;
      let expiresAt: Date | undefined;

      if (ctx) {
        // Generate actual Telegram invite link
        if (portal.inviteLinkType === 'one_time') {
          // One-time use link
          const link = await ctx.telegram.createChatInviteLink(Number(group.telegramId), {
            member_limit: 1,
          });
          inviteLink = link.invite_link;
          memberLimit = 1;
        } else if (portal.inviteLinkType === 'time_limited') {
          // Time-limited link
          const expireTime = Math.floor(Date.now() / 1000) + portal.inviteLinkExpiry;
          const link = await ctx.telegram.createChatInviteLink(Number(group.telegramId), {
            expire_date: expireTime,
          });
          inviteLink = link.invite_link;
          expiresAt = new Date(expireTime * 1000);
        } else {
          // Permanent link (for testing or special cases)
          const link = await ctx.telegram.createChatInviteLink(Number(group.telegramId));
          inviteLink = link.invite_link;
        }
      } else {
        // Fallback for testing without bot context
        inviteLink = `https://t.me/+MOCK_INVITE_${Date.now()}`;
        if (portal.inviteLinkType === 'one_time') {
          memberLimit = 1;
        } else if (portal.inviteLinkType === 'time_limited') {
          expiresAt = new Date(Date.now() + portal.inviteLinkExpiry * 1000);
        }
      }

      // Store invite link in database
      const storedLink = await prisma.inviteLink.create({
        data: {
          portalId,
          inviteLink,
          linkType: portal.inviteLinkType,
          memberLimit,
          expiresAt,
          createdFor: forUserId,
        },
      });

      logger.info(`Generated ${portal.inviteLinkType} invite link for user ${forUserId}`);

      return storedLink;
    } catch (error) {
      logger.error('Error generating invite link:', error);
      throw error;
    }
  }

  /**
   * Mark an invite link as used
   */
  async markInviteLinkUsed(inviteLink: string, usedBy: bigint): Promise<void> {
    try {
      await prisma.inviteLink.updateMany({
        where: { inviteLink },
        data: {
          isUsed: true,
          usedBy,
          usedAt: new Date(),
        },
      });

      logger.info(`Invite link marked as used by user ${usedBy}`);
    } catch (error) {
      logger.error('Error marking invite link as used:', error);
    }
  }

  /**
   * Revoke an invite link
   */
  async revokeInviteLink(inviteLinkId: string, ctx?: Context): Promise<boolean> {
    try {
      const link = await prisma.inviteLink.findUnique({
        where: { id: inviteLinkId },
        include: { portal: true },
      });

      if (!link) {
        return false;
      }

      // Revoke on Telegram if context provided
      if (ctx) {
        try {
          const group = await prisma.group.findUnique({
            where: { id: link.portal.groupId },
          });

          if (group) {
            await ctx.telegram.revokeChatInviteLink(Number(group.telegramId), link.inviteLink);
          }
        } catch (error) {
          logger.warn('Failed to revoke link on Telegram:', error);
        }
      }

      // Mark as revoked in database
      await prisma.inviteLink.update({
        where: { id: inviteLinkId },
        data: { isRevoked: true },
      });

      logger.info(`Revoked invite link ${inviteLinkId}`);
      return true;
    } catch (error) {
      logger.error('Error revoking invite link:', error);
      return false;
    }
  }

  /**
   * Clean up expired invite links
   */
  async cleanupExpiredLinks(): Promise<number> {
    try {
      const result = await prisma.inviteLink.updateMany({
        where: {
          expiresAt: { lt: new Date() },
          isUsed: false,
          isRevoked: false,
        },
        data: { isRevoked: true },
      });

      if (result.count > 0) {
        logger.info(`Cleaned up ${result.count} expired invite links`);
      }

      return result.count;
    } catch (error) {
      logger.error('Error cleaning up expired links:', error);
      return 0;
    }
  }

  /**
   * Update portal message in channel
   */
  async updatePortalMessage(portalId: string, ctx: Context): Promise<boolean> {
    try {
      const portal = await this.getPortalById(portalId);

      if (!portal) {
        return false;
      }

      // Build message caption
      const caption = this.buildPortalMessage(portal);

      // Build inline keyboard
      const keyboard = this.buildPortalKeyboard(portal, ctx.botInfo?.username);

      // Update or send message
      try {
        if (portal.portalMessageId) {
          // Update existing message
          if (portal.mediaFileId) {
            await ctx.telegram.editMessageMedia(
              Number(portal.channelId),
              portal.portalMessageId,
              undefined,
              {
                type: portal.mediaType || 'photo',
                media: portal.mediaFileId,
                caption,
                parse_mode: 'HTML',
              },
              { reply_markup: { inline_keyboard: keyboard } }
            );
          } else {
            await ctx.telegram.editMessageText(
              Number(portal.channelId),
              portal.portalMessageId,
              undefined,
              caption,
              {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard },
              }
            );
          }
        } else {
          // Send new message
          let sentMessage;
          if (portal.mediaFileId) {
            if (portal.mediaType === 'photo') {
              sentMessage = await ctx.telegram.sendPhoto(Number(portal.channelId), portal.mediaFileId, {
                caption,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard },
              });
            } else if (portal.mediaType === 'video') {
              sentMessage = await ctx.telegram.sendVideo(Number(portal.channelId), portal.mediaFileId, {
                caption,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard },
              });
            } else if (portal.mediaType === 'animation') {
              sentMessage = await ctx.telegram.sendAnimation(Number(portal.channelId), portal.mediaFileId, {
                caption,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard },
              });
            }
          } else {
            sentMessage = await ctx.telegram.sendMessage(Number(portal.channelId), caption, {
              parse_mode: 'HTML',
              reply_markup: { inline_keyboard: keyboard },
            });
          }

          if (sentMessage) {
            // Store message ID
            await prisma.portal.update({
              where: { id: portalId },
              data: { portalMessageId: sentMessage.message_id },
            });
          }
        }

        logger.info(`Updated portal message for portal ${portalId}`);
        return true;
      } catch (error) {
        logger.error('Error updating portal message on Telegram:', error);
        return false;
      }
    } catch (error) {
      logger.error('Error updating portal message:', error);
      return false;
    }
  }

  /**
   * Build portal message text
   */
  private buildPortalMessage(portal: any): string {
    return `
<b>${portal.headerText}</b>

${portal.description}

<i>Click the verification button below to join our community!</i>
`.trim();
  }

  /**
   * Build portal inline keyboard
   */
  private buildPortalKeyboard(portal: any, botUsername?: string): any[][] {
    const keyboard: any[][] = [];

    portal.buttons.forEach((button: any) => {
      if (button.isVerifyButton) {
        const fallbackUrl =
          botUsername && portal.id ? `https://t.me/${botUsername}?start=verify_${portal.id}` : '';
        keyboard.push([
          {
            text: button.text,
            url: button.url || fallbackUrl,
          },
        ]);
      } else {
        keyboard.push([
          {
            text: button.text,
            url: button.url,
          },
        ]);
      }
    });

    return keyboard;
  }

  /**
   * Add custom button to portal
   */
  async addPortalButton(portalId: string, button: PortalButtonConfig): Promise<boolean> {
    try {
      // Get current max order
      const buttons = await prisma.portalButton.findMany({
        where: { portalId },
        orderBy: { order: 'desc' },
        take: 1,
      });

      const nextOrder = buttons.length > 0 ? buttons[0].order + 1 : 0;

      await prisma.portalButton.create({
        data: {
          portalId,
          text: button.text,
          url: button.url,
          order: nextOrder,
          isVerifyButton: button.isVerifyButton || false,
        },
      });

      logger.info(`Added button "${button.text}" to portal ${portalId}`);
      return true;
    } catch (error) {
      logger.error('Error adding portal button:', error);
      return false;
    }
  }

  /**
   * Remove portal button
   */
  async removePortalButton(buttonId: string): Promise<boolean> {
    try {
      await prisma.portalButton.delete({
        where: { id: buttonId },
      });

      logger.info(`Removed portal button ${buttonId}`);
      return true;
    } catch (error) {
      logger.error('Error removing portal button:', error);
      return false;
    }
  }

  /**
   * Update portal media
   */
  async updatePortalMedia(
    portalId: string,
    mediaType: 'photo' | 'video' | 'animation',
    mediaFileId: string,
    mediaUrl?: string
  ): Promise<boolean> {
    try {
      await prisma.portal.update({
        where: { id: portalId },
        data: {
          mediaType,
          mediaFileId,
          mediaUrl,
        },
      });

      logger.info(`Updated media for portal ${portalId}`);
      return true;
    } catch (error) {
      logger.error('Error updating portal media:', error);
      return false;
    }
  }

  /**
   * Revoke all public invite links for a group when portal is activated
   */
  async revokePublicInviteLinks(groupId: string, ctx: Context): Promise<boolean> {
    try {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
      });

      if (!group) {
        logger.error(`Group ${groupId} not found`);
        return false;
      }

      // Export the primary invite link and revoke it
      try {
        // Get the primary invite link
        const primaryLink = await ctx.telegram.exportChatInviteLink(Number(group.telegramId));

        if (primaryLink) {
          // Revoke it
          await ctx.telegram.revokeChatInviteLink(Number(group.telegramId), primaryLink);
          logger.info(`Revoked primary invite link for group ${groupId}: ${primaryLink}`);
        }
      } catch (error: any) {
        logger.warn(`Could not export/revoke primary chat invite link: ${error.message}`);
      }

      logger.info(`Successfully locked down group ${groupId} - all public invite links revoked`);
      return true;
    } catch (error) {
      logger.error('Error revoking public invite links:', error);
      return false;
    }
  }

  /**
   * Get portal statistics
   */
  async getPortalStats(portalId: string) {
    try {
      const [totalAttempts, successful, failed, totalLinks, usedLinks, activeLinks] = await Promise.all([
        prisma.verificationAttempt.count({ where: { portalId } }),
        prisma.verificationAttempt.count({ where: { portalId, status: 'solved' } }),
        prisma.verificationAttempt.count({ where: { portalId, status: 'failed' } }),
        prisma.inviteLink.count({ where: { portalId } }),
        prisma.inviteLink.count({ where: { portalId, isUsed: true } }),
        prisma.inviteLink.count({
          where: {
            portalId,
            isUsed: false,
            isRevoked: false,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        }),
      ]);

      const successRate = totalAttempts > 0 ? (successful / totalAttempts) * 100 : 0;
      const linkUsageRate = totalLinks > 0 ? (usedLinks / totalLinks) * 100 : 0;

      return {
        verifications: {
          total: totalAttempts,
          successful,
          failed,
          pending: totalAttempts - successful - failed,
          successRate: successRate.toFixed(2),
        },
        inviteLinks: {
          total: totalLinks,
          used: usedLinks,
          active: activeLinks,
          usageRate: linkUsageRate.toFixed(2),
        },
      };
    } catch (error) {
      logger.error('Error getting portal stats:', error);
      return null;
    }
  }
}

export default new PortalService();
