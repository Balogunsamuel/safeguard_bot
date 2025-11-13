import logger from './utils/logger';
import { connectDatabase } from './utils/database';
import { connectRedis } from './utils/redis';
import solanaWorker from './workers/solana.worker';
import evmWorker from './workers/evm.worker';

/**
 * Main worker process that coordinates blockchain monitoring
 */
async function startWorker() {
  try {
    logger.info('Starting blockchain worker...');

    // Connect to database and Redis
    await connectDatabase();
    await connectRedis();

    // Start blockchain workers
    await solanaWorker.start();
    await evmWorker.start();

    logger.info('Blockchain worker is running');
  } catch (error) {
    logger.error('Failed to start worker:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  logger.info('Shutting down worker...');

  try {
    solanaWorker.stop();
    await evmWorker.stop();
    logger.info('Worker shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors - log but don't exit to keep worker running
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  // Don't exit - let the worker continue running
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit - let the worker continue running
});

// Start the worker
if (require.main === module) {
  startWorker();
}

export default startWorker;
