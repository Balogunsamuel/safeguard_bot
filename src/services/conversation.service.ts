/**
 * Conversation State Management Service
 * Handles multi-step wizard flows and conversation context
 */

import { getRedisClient } from '../utils/redis';
import logger from '../utils/logger';

export interface ConversationState {
  step: string;
  data: Record<string, any>;
  userId: number;
  chatId: number;
  createdAt: number;
  expiresAt: number;
}

export type ConversationStep =
  | 'setup_select_group'
  | 'setup_select_channel'
  | 'setup_customize_portal'
  | 'setup_portal_media'
  | 'setup_portal_text'
  | 'setup_complete'
  | 'portal_created'
  | 'buybot_select_chain'
  | 'buybot_enter_address'
  | 'config_select_group'
  | 'config_menu'
  | 'welcome_message_text'
  | 'welcome_message_media'
  | 'add_token_chain'
  | 'add_token_address';

class ConversationService {
  private readonly PREFIX = 'conversation:';
  private readonly TTL = 3600; // 1 hour

  /**
   * Set conversation state for a user
   */
  async setState(
    userId: number,
    chatId: number,
    step: ConversationStep,
    data: Record<string, any> = {}
  ): Promise<void> {
    try {
      const redis = getRedisClient();
      const key = `${this.PREFIX}${userId}:${chatId}`;
      const state: ConversationState = {
        step,
        data,
        userId,
        chatId,
        createdAt: Date.now(),
        expiresAt: Date.now() + this.TTL * 1000,
      };

      await redis.setex(key, this.TTL, JSON.stringify(state));
      logger.debug(`Conversation state set for user ${userId}: ${step}`);
    } catch (error) {
      logger.error('Failed to set conversation state:', error);
      throw error;
    }
  }

  /**
   * Get conversation state for a user
   */
  async getState(userId: number, chatId: number): Promise<ConversationState | null> {
    try {
      const redis = getRedisClient();
      const key = `${this.PREFIX}${userId}:${chatId}`;
      const data = await redis.get(key);

      if (!data) {
        return null;
      }

      const state: ConversationState = JSON.parse(data);

      // Check if expired
      if (Date.now() > state.expiresAt) {
        await this.clearState(userId, chatId);
        return null;
      }

      return state;
    } catch (error) {
      logger.error('Failed to get conversation state:', error);
      return null;
    }
  }

  /**
   * Update conversation data without changing the step
   */
  async updateData(
    userId: number,
    chatId: number,
    data: Record<string, any>
  ): Promise<void> {
    try {
      const state = await this.getState(userId, chatId);
      if (!state) {
        throw new Error('No active conversation found');
      }

      state.data = { ...state.data, ...data };
      await this.setState(userId, chatId, state.step as ConversationStep, state.data);
    } catch (error) {
      logger.error('Failed to update conversation data:', error);
      throw error;
    }
  }

  /**
   * Move to the next step
   */
  async nextStep(
    userId: number,
    chatId: number,
    nextStep: ConversationStep,
    additionalData: Record<string, any> = {}
  ): Promise<void> {
    try {
      const state = await this.getState(userId, chatId);
      if (!state) {
        throw new Error('No active conversation found');
      }

      const newData = { ...state.data, ...additionalData };
      await this.setState(userId, chatId, nextStep, newData);
    } catch (error) {
      logger.error('Failed to move to next step:', error);
      throw error;
    }
  }

  /**
   * Clear conversation state
   */
  async clearState(userId: number, chatId: number): Promise<void> {
    try {
      const redis = getRedisClient();
      const key = `${this.PREFIX}${userId}:${chatId}`;
      await redis.del(key);
      logger.debug(`Conversation state cleared for user ${userId}`);
    } catch (error) {
      logger.error('Failed to clear conversation state:', error);
      throw error;
    }
  }

  /**
   * Check if user has an active conversation
   */
  async hasActiveConversation(userId: number, chatId: number): Promise<boolean> {
    const state = await this.getState(userId, chatId);
    return state !== null;
  }

  /**
   * Get all active conversations for a user (across all chats)
   */
  async getUserConversations(userId: number): Promise<ConversationState[]> {
    try {
      const redis = getRedisClient();
      const pattern = `${this.PREFIX}${userId}:*`;
      const keys = await redis.keys(pattern);

      if (!keys || keys.length === 0) {
        return [];
      }

      const conversations: ConversationState[] = [];
      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          const state: ConversationState = JSON.parse(data);
          if (Date.now() <= state.expiresAt) {
            conversations.push(state);
          }
        }
      }

      return conversations;
    } catch (error) {
      logger.error('Failed to get user conversations:', error);
      return [];
    }
  }

  /**
   * Clear all expired conversations (cleanup task)
   */
  async cleanupExpiredConversations(): Promise<number> {
    try {
      const redis = getRedisClient();
      const pattern = `${this.PREFIX}*`;
      const keys = await redis.keys(pattern);

      if (!keys || keys.length === 0) {
        return 0;
      }

      let cleaned = 0;
      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          const state: ConversationState = JSON.parse(data);
          if (Date.now() > state.expiresAt) {
            await redis.del(key);
            cleaned++;
          }
        }
      }

      if (cleaned > 0) {
        logger.info(`Cleaned up ${cleaned} expired conversations`);
      }

      return cleaned;
    } catch (error) {
      logger.error('Failed to cleanup expired conversations:', error);
      return 0;
    }
  }
}

export const conversationService = new ConversationService();