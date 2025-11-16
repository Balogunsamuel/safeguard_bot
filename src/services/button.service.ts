import prisma from '../utils/database';
import logger from '../utils/logger';

export interface CustomButton {
  text: string;
  url: string;
}

export class ButtonService {
  /**
   * Set custom buttons for a token
   */
  async setCustomButtons(tokenId: string, buttons: CustomButton[]): Promise<void> {
    try {
      if (buttons.length > 3) {
        throw new Error('Maximum 3 buttons allowed per token');
      }

      // Validate button data
      for (const button of buttons) {
        if (!button.text || button.text.length > 64) {
          throw new Error('Button text must be 1-64 characters');
        }
        if (!button.url || !this.isValidUrl(button.url)) {
          throw new Error('Button URL must be a valid URL');
        }
      }

      const buttonsJson = JSON.stringify(buttons);

      await prisma.trackedToken.update({
        where: { id: tokenId },
        data: { customButtons: buttonsJson },
      });

      logger.info(`Custom buttons updated for token ${tokenId}`);
    } catch (error) {
      logger.error('Error setting custom buttons:', error);
      throw error;
    }
  }

  /**
   * Get custom buttons for a token
   */
  async getCustomButtons(tokenId: string): Promise<CustomButton[]> {
    try {
      const token = await prisma.trackedToken.findUnique({
        where: { id: tokenId },
        select: { customButtons: true },
      });

      if (!token || !token.customButtons) {
        return [];
      }

      return JSON.parse(token.customButtons) as CustomButton[];
    } catch (error) {
      logger.error('Error getting custom buttons:', error);
      return [];
    }
  }

  /**
   * Add a single button to existing buttons for a token
   */
  async addCustomButton(tokenId: string, button: CustomButton): Promise<void> {
    try {
      // Get existing buttons
      const existingButtons = await this.getCustomButtons(tokenId);

      // Check if we already have 3 buttons
      if (existingButtons.length >= 3) {
        throw new Error('Maximum 3 buttons allowed. Remove a button first or use /setbuttons to replace all.');
      }

      // Validate new button
      if (!button.text || button.text.length > 64) {
        throw new Error('Button text must be 1-64 characters');
      }
      if (!button.url || !this.isValidUrl(button.url)) {
        throw new Error('Button URL must be a valid URL');
      }

      // Add new button
      const newButtons = [...existingButtons, button];
      const buttonsJson = JSON.stringify(newButtons);

      await prisma.trackedToken.update({
        where: { id: tokenId },
        data: { customButtons: buttonsJson },
      });

      logger.info(`Custom button added for token ${tokenId}`);
    } catch (error) {
      logger.error('Error adding custom button:', error);
      throw error;
    }
  }

  /**
   * Clear custom buttons for a token
   */
  async clearCustomButtons(tokenId: string): Promise<void> {
    try {
      await prisma.trackedToken.update({
        where: { id: tokenId },
        data: { customButtons: null },
      });

      logger.info(`Custom buttons cleared for token ${tokenId}`);
    } catch (error) {
      logger.error('Error clearing custom buttons:', error);
      throw error;
    }
  }

  /**
   * Format buttons for Telegram inline keyboard
   */
  formatTelegramButtons(buttons: CustomButton[]): any {
    if (buttons.length === 0) return undefined;

    return {
      inline_keyboard: [
        buttons.map((btn) => ({
          text: btn.text,
          url: btn.url,
        })),
      ],
    };
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}

export default new ButtonService();