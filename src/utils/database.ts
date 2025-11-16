import { PrismaClient } from '@prisma/client';
import logger from './logger';

// Prisma client singleton
let prisma: PrismaClient;

/**
 * Get Prisma client instance
 * Implements singleton pattern to prevent multiple connections
 */
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
      ],
    }) as PrismaClient;

    // Log warnings
    (prisma.$on as any)('warn', (e: any) => {
      logger.warn('Prisma warning:', e);
    });

    // Log errors
    (prisma.$on as any)('error', (e: any) => {
      logger.error('Prisma error:', e);
    });

    logger.info('Prisma client initialized');
  }

  return prisma;
}

/**
 * Connect to database
 */
export async function connectDatabase(): Promise<void> {
  try {
    const client = getPrismaClient();
    await client.$connect();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
}

/**
 * Disconnect from database
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    if (prisma) {
      await prisma.$disconnect();
      logger.info('Database disconnected');
    }
  } catch (error) {
    logger.error('Failed to disconnect from database:', error);
    throw error;
  }
}

export default getPrismaClient();
