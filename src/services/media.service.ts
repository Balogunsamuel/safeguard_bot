import prisma from '../utils/database';
import logger from '../utils/logger';

export type MediaType = 'gif' | 'image' | 'video';

export class MediaService {
  /**
   * Set custom media for a token
   */
  async setMedia(tokenId: string, mediaType: MediaType, mediaUrl: string): Promise<void> {
    try {
      await prisma.trackedToken.update({
        where: { id: tokenId },
        data: {
          mediaType,
          mediaUrl,
        },
      });

      logger.info(`Media set for token ${tokenId}: ${mediaType} - ${mediaUrl}`);
    } catch (error) {
      logger.error('Error setting media:', error);
      throw error;
    }
  }

  /**
   * Get media for a token
   */
  async getMedia(tokenId: string): Promise<{ type: MediaType; url: string } | null> {
    try {
      const token = await prisma.trackedToken.findUnique({
        where: { id: tokenId },
        select: { mediaType: true, mediaUrl: true },
      });

      if (!token || !token.mediaType || !token.mediaUrl) {
        return null;
      }

      return {
        type: token.mediaType as MediaType,
        url: token.mediaUrl,
      };
    } catch (error) {
      logger.error('Error getting media:', error);
      return null;
    }
  }

  /**
   * Clear media for a token
   */
  async clearMedia(tokenId: string): Promise<void> {
    try {
      await prisma.trackedToken.update({
        where: { id: tokenId },
        data: {
          mediaType: null,
          mediaUrl: null,
        },
      });

      logger.info(`Media cleared for token ${tokenId}`);
    } catch (error) {
      logger.error('Error clearing media:', error);
      throw error;
    }
  }

  /**
   * Validate media URL
   */
  isValidMediaUrl(url: string, type: MediaType): boolean {
    try {
      const urlObj = new URL(url);

      // Check protocol
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return false;
      }

      // Check file extension based on type
      const validExtensions: Record<MediaType, string[]> = {
        gif: ['.gif'],
        image: ['.jpg', '.jpeg', '.png', '.webp'],
        video: ['.mp4', '.webm', '.mov'],
      };

      const pathname = urlObj.pathname.toLowerCase();
      const extensions = validExtensions[type];

      return extensions.some((ext) => pathname.endsWith(ext));
    } catch {
      return false;
    }
  }

  /**
   * Get Telegram-compatible media options
   */
  getTelegramMediaOptions(mediaType: MediaType, mediaUrl: string): any {
    switch (mediaType) {
      case 'gif':
        return { animation: mediaUrl };
      case 'image':
        return { photo: mediaUrl };
      case 'video':
        return { video: mediaUrl };
      default:
        return null;
    }
  }
}

export default new MediaService();