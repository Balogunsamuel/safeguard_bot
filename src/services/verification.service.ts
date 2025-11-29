import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * CAPTCHA types supported by the system
 */
export type CaptchaType = 'emoji_match' | 'math_challenge' | 'text_challenge';

/**
 * Difficulty levels for CAPTCHA
 */
export type CaptchaDifficulty = 'easy' | 'medium' | 'hard';

/**
 * CAPTCHA challenge data structure
 */
export interface CaptchaChallenge {
  type: CaptchaType;
  question: string;
  options: string[];
  correctAnswer: string;
  emoji?: string;
}

/**
 * Verification result
 */
export interface VerificationResult {
  success: boolean;
  isPremium: boolean;
  inviteLink?: string;
  error?: string;
  attemptsRemaining?: number;
}

class VerificationService {
  private readonly EMOJI_SETS = {
    easy: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊'],
    medium: ['🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🥝'],
    hard: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🚚', '🚛'],
  };

  /**
   * Check if a user has Telegram Premium
   * Note: This requires the user to interact with the bot first
   */
  async isPremiumUser(telegramUserId: bigint): Promise<boolean> {
    try {
      // Premium status would be detected during bot interaction
      // We'll store this in the verification attempt
      // For now, we return false and detect during the verification flow
      return false;
    } catch (error) {
      logger.error(`Error checking premium status for user ${telegramUserId}:`, error);
      return false;
    }
  }

  /**
   * Generate a CAPTCHA challenge based on difficulty
   */
  generateCaptcha(difficulty: CaptchaDifficulty): CaptchaChallenge {
    const challenges: CaptchaChallenge[] = [
      this.generateEmojiChallenge(difficulty),
      this.generateMathChallenge(difficulty),
      this.generateTextChallenge(difficulty),
    ];

    // Randomly select a challenge type
    return challenges[Math.floor(Math.random() * challenges.length)];
  }

  /**
   * Generate emoji matching challenge
   */
  private generateEmojiChallenge(difficulty: CaptchaDifficulty): CaptchaChallenge {
    const emojiSet = this.EMOJI_SETS[difficulty];
    const correctEmoji = emojiSet[Math.floor(Math.random() * emojiSet.length)];

    // Generate wrong options
    const options = [correctEmoji];
    while (options.length < (difficulty === 'easy' ? 4 : difficulty === 'medium' ? 6 : 9)) {
      const emoji = emojiSet[Math.floor(Math.random() * emojiSet.length)];
      if (!options.includes(emoji)) {
        options.push(emoji);
      }
    }

    // Shuffle options
    const shuffled = options.sort(() => Math.random() - 0.5);

    return {
      type: 'emoji_match',
      question: `Select the ${correctEmoji} emoji to verify you're human`,
      options: shuffled,
      correctAnswer: correctEmoji,
      emoji: correctEmoji,
    };
  }

  /**
   * Generate math challenge
   */
  private generateMathChallenge(difficulty: CaptchaDifficulty): CaptchaChallenge {
    let num1: number, num2: number, operation: string, answer: number;

    switch (difficulty) {
      case 'easy':
        num1 = Math.floor(Math.random() * 10) + 1;
        num2 = Math.floor(Math.random() * 10) + 1;
        operation = '+';
        answer = num1 + num2;
        break;
      case 'medium':
        num1 = Math.floor(Math.random() * 20) + 1;
        num2 = Math.floor(Math.random() * 20) + 1;
        operation = Math.random() > 0.5 ? '+' : '-';
        answer = operation === '+' ? num1 + num2 : num1 - num2;
        break;
      case 'hard':
        num1 = Math.floor(Math.random() * 15) + 1;
        num2 = Math.floor(Math.random() * 12) + 1;
        const ops = ['+', '-', '*'];
        operation = ops[Math.floor(Math.random() * ops.length)];
        answer = operation === '+' ? num1 + num2 : operation === '-' ? num1 - num2 : num1 * num2;
        break;
    }

    // Generate wrong options
    const options = [answer.toString()];
    while (options.length < 4) {
      const wrong = answer + Math.floor(Math.random() * 10) - 5;
      if (wrong !== answer && !options.includes(wrong.toString())) {
        options.push(wrong.toString());
      }
    }

    return {
      type: 'math_challenge',
      question: `Solve: ${num1} ${operation} ${num2} = ?`,
      options: options.sort(() => Math.random() - 0.5),
      correctAnswer: answer.toString(),
    };
  }

  /**
   * Generate text challenge (simple question)
   */
  private generateTextChallenge(difficulty: CaptchaDifficulty): CaptchaChallenge {
    const challenges = {
      easy: [
        { q: 'What color is the sky on a clear day?', a: 'Blue', o: ['Blue', 'Red', 'Green', 'Yellow'] },
        { q: 'How many legs does a dog have?', a: '4', o: ['2', '4', '6', '8'] },
        { q: 'What do cows drink?', a: 'Water', o: ['Milk', 'Water', 'Juice', 'Soda'] },
      ],
      medium: [
        { q: 'What is the capital of France?', a: 'Paris', o: ['London', 'Paris', 'Berlin', 'Rome'] },
        { q: 'How many days in a week?', a: '7', o: ['5', '6', '7', '8'] },
        { q: 'What planet is known as the Red Planet?', a: 'Mars', o: ['Venus', 'Mars', 'Jupiter', 'Saturn'] },
      ],
      hard: [
        { q: 'What is the largest ocean on Earth?', a: 'Pacific', o: ['Atlantic', 'Pacific', 'Indian', 'Arctic'] },
        { q: 'What year did World War II end?', a: '1945', o: ['1943', '1944', '1945', '1946'] },
        { q: 'What is the speed of light? (km/s)', a: '299,792', o: ['199,792', '299,792', '399,792', '499,792'] },
      ],
    };

    const challengeSet = challenges[difficulty];
    const selected = challengeSet[Math.floor(Math.random() * challengeSet.length)];

    return {
      type: 'text_challenge',
      question: selected.q,
      options: selected.o.sort(() => Math.random() - 0.5),
      correctAnswer: selected.a,
    };
  }

  /**
   * Create a verification attempt for a user
   */
  async createVerificationAttempt(
    portalId: string,
    telegramUserId: bigint,
    username: string | undefined,
    isPremium: boolean,
    difficulty: CaptchaDifficulty
  ) {
    try {
      // Get portal configuration
      const portal = await prisma.portal.findUnique({
        where: { id: portalId },
      });

      if (!portal) {
        throw new Error('Portal not found');
      }

      // Check for existing pending attempt
      const existing = await prisma.verificationAttempt.findFirst({
        where: {
          portalId,
          telegramUserId,
          status: 'pending',
          expiresAt: { gt: new Date() },
        },
      });

      if (existing) {
        return existing;
      }

      // Generate challenge
      const challenge = this.generateCaptcha(difficulty);

      // Create new attempt
      const attempt = await prisma.verificationAttempt.create({
        data: {
          portalId,
          telegramUserId,
          username,
          challengeType: challenge.type,
          challengeData: JSON.stringify(challenge),
          isPremium,
          status: 'pending',
          expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
          maxAttempts: isPremium ? 5 : 3, // Premium gets more attempts
        },
      });

      logger.info(
        `Created verification attempt for user ${telegramUserId} (${username}) - Type: ${challenge.type}, Premium: ${isPremium}`
      );

      return attempt;
    } catch (error) {
      logger.error('Error creating verification attempt:', error);
      throw error;
    }
  }

  /**
   * Verify user's answer to the challenge
   */
  async verifyAnswer(attemptId: string, userAnswer: string): Promise<VerificationResult> {
    try {
      const attempt = await prisma.verificationAttempt.findUnique({
        where: { id: attemptId },
        include: { portal: true },
      });

      if (!attempt) {
        return { success: false, isPremium: false, error: 'Verification attempt not found' };
      }

      // Check if expired
      if (new Date() > attempt.expiresAt) {
        await prisma.verificationAttempt.update({
          where: { id: attemptId },
          data: { status: 'expired' },
        });
        return { success: false, isPremium: attempt.isPremium, error: 'Verification expired' };
      }

      // Check if already used
      if (attempt.status !== 'pending') {
        return { success: false, isPremium: attempt.isPremium, error: 'Verification already completed' };
      }

      // Check max attempts
      if (attempt.attempts >= attempt.maxAttempts) {
        await prisma.verificationAttempt.update({
          where: { id: attemptId },
          data: { status: 'failed' },
        });
        return { success: false, isPremium: attempt.isPremium, error: 'Maximum attempts exceeded' };
      }

      // Get challenge data
      const challenge: CaptchaChallenge = JSON.parse(attempt.challengeData || '{}');

      // Increment attempts
      await prisma.verificationAttempt.update({
        where: { id: attemptId },
        data: { attempts: attempt.attempts + 1 },
      });

      // Check answer
      const isCorrect = userAnswer.trim().toLowerCase() === challenge.correctAnswer.trim().toLowerCase();

      if (!isCorrect) {
        const attemptsRemaining = attempt.maxAttempts - (attempt.attempts + 1);
        if (attemptsRemaining <= 0) {
          await prisma.verificationAttempt.update({
            where: { id: attemptId },
            data: { status: 'failed' },
          });
        }
        return {
          success: false,
          isPremium: attempt.isPremium,
          error: 'Incorrect answer',
          attemptsRemaining,
        };
      }

      // Success! Generate invite link
      const portalService = require('./portal.service').default;
      const inviteLink = await portalService.generateInviteLink(
        attempt.portal.groupId,
        attempt.portalId,
        attempt.telegramUserId
      );

      // Update attempt
      await prisma.verificationAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'solved',
          solvedAt: new Date(),
          inviteLinkId: inviteLink.id,
        },
      });

      logger.info(`User ${attempt.telegramUserId} (${attempt.username}) successfully verified!`);

      return {
        success: true,
        isPremium: attempt.isPremium,
        inviteLink: inviteLink.inviteLink,
      };
    } catch (error) {
      logger.error('Error verifying answer:', error);
      return { success: false, isPremium: false, error: 'Verification failed' };
    }
  }

  /**
   * Get challenge data for displaying to user
   */
  async getChallengeData(attemptId: string): Promise<CaptchaChallenge | null> {
    try {
      const attempt = await prisma.verificationAttempt.findUnique({
        where: { id: attemptId },
      });

      if (!attempt || !attempt.challengeData) {
        return null;
      }

      return JSON.parse(attempt.challengeData);
    } catch (error) {
      logger.error('Error getting challenge data:', error);
      return null;
    }
  }

  /**
   * Clean up expired verification attempts
   */
  async cleanupExpiredAttempts(): Promise<number> {
    try {
      const result = await prisma.verificationAttempt.updateMany({
        where: {
          status: 'pending',
          expiresAt: { lt: new Date() },
        },
        data: { status: 'expired' },
      });

      if (result.count > 0) {
        logger.info(`Cleaned up ${result.count} expired verification attempts`);
      }

      return result.count;
    } catch (error) {
      logger.error('Error cleaning up expired attempts:', error);
      return 0;
    }
  }

  /**
   * Get verification statistics for a portal
   */
  async getVerificationStats(portalId: string) {
    try {
      const [total, successful, failed, pending] = await Promise.all([
        prisma.verificationAttempt.count({ where: { portalId } }),
        prisma.verificationAttempt.count({ where: { portalId, status: 'solved' } }),
        prisma.verificationAttempt.count({ where: { portalId, status: 'failed' } }),
        prisma.verificationAttempt.count({ where: { portalId, status: 'pending' } }),
      ]);

      const successRate = total > 0 ? (successful / total) * 100 : 0;

      return {
        total,
        successful,
        failed,
        pending,
        successRate: successRate.toFixed(2),
      };
    } catch (error) {
      logger.error('Error getting verification stats:', error);
      return null;
    }
  }
}

export default new VerificationService();
