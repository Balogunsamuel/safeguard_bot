/**
 * Main entry point for the application
 * Starts all services: Bot, Worker, and API
 */
import logger from './utils/logger';
import { startBot } from './bot';
import startWorker from './worker';
import { startAPI } from './api';
import config from './config';

async function main() {
  try {
    logger.info('Starting Safeguard Bot application...');
    logger.info(`Environment: ${config.env}`);

    // Start all services in parallel
    await Promise.all([
      startBot(),
      startWorker(),
      startAPI(),
    ]);

    logger.info('All services started successfully');
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
main();
