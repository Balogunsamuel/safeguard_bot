import express, { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import config from './config';
import logger from './utils/logger';
import { connectDatabase } from './utils/database';
import { connectRedis } from './utils/redis';
import prisma from './utils/database';
import bot from './bot';

// Add BigInt serialization support for JSON
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS support for dashboard
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-API-Key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later.',
});

app.use('/api/', limiter);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

/**
 * API Key authentication middleware
 */
function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;

  if (!apiKey || apiKey !== config.admin.apiKey) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or missing API key',
    });
  }

  next();
}

/**
 * Health check endpoint
 */
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: 'Service unavailable',
    });
  }
});

/**
 * Telegram webhook endpoint
 */
app.post('/webhook', async (req, res) => {
  try {
    // Verify webhook secret
    const secret = req.headers['x-telegram-bot-api-secret-token'];
    if (config.telegram.webhookSecret && secret !== config.telegram.webhookSecret) {
      return res.status(403).json({ error: 'Invalid secret' });
    }

    // Handle update
    await bot.handleUpdate(req.body);
    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get all groups
 */
app.get('/api/groups', requireApiKey, async (req, res) => {
  try {
    const groups = await prisma.group.findMany({
      where: { isActive: true },
      include: {
        trackedTokens: true,
        _count: {
          select: { verifications: true },
        },
      },
    });

    res.json({
      success: true,
      data: groups,
    });
  } catch (error) {
    logger.error('Error fetching groups:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch groups',
    });
  }
});

/**
 * Get group details
 */
app.get('/api/groups/:groupId', requireApiKey, async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        trackedTokens: true,
        verifications: {
          include: { user: true },
        },
      },
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found',
      });
    }

    res.json({
      success: true,
      data: group,
    });
  } catch (error) {
    logger.error('Error fetching group:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch group',
    });
  }
});

/**
 * Get all tracked tokens
 */
app.get('/api/tokens', requireApiKey, async (req, res) => {
  try {
    const { chain, groupId } = req.query;

    const where: any = { isActive: true };
    if (chain) where.chain = chain;
    if (groupId) where.groupId = groupId;

    const tokens = await prisma.trackedToken.findMany({
      where,
      include: {
        group: true,
        _count: {
          select: { transactions: true },
        },
      },
    });

    res.json({
      success: true,
      data: tokens,
    });
  } catch (error) {
    logger.error('Error fetching tokens:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tokens',
    });
  }
});

/**
 * Get transactions
 */
app.get('/api/transactions', requireApiKey, async (req, res) => {
  try {
    const { tokenId, chain, type, limit = 50 } = req.query;

    const where: any = {};
    if (tokenId) where.tokenId = tokenId;
    if (chain) where.chain = chain;
    if (type) where.type = type;

    const transactions = await prisma.transaction.findMany({
      where,
      include: { token: true },
      orderBy: { timestamp: 'desc' },
      take: parseInt(limit as string),
    });

    res.json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    logger.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transactions',
    });
  }
});

/**
 * Get daily stats
 */
app.get('/api/stats/daily', requireApiKey, async (req, res) => {
  try {
    const { chain, tokenAddress, days = 7 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days as string));
    startDate.setHours(0, 0, 0, 0);

    const where: any = { date: { gte: startDate } };
    if (chain) where.chain = chain;
    if (tokenAddress) where.tokenAddress = tokenAddress;

    const stats = await prisma.dailyStats.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error fetching daily stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch daily stats',
    });
  }
});

/**
 * Get dashboard overview
 */
app.get('/api/dashboard', requireApiKey, async (req, res) => {
  try {
    const [
      totalGroups,
      totalVerifiedUsers,
      totalTrackedTokens,
      totalTransactions,
      recentTransactions,
    ] = await Promise.all([
      prisma.group.count({ where: { isActive: true } }),
      prisma.groupVerification.count({ where: { isVerified: true } }),
      prisma.trackedToken.count({ where: { isActive: true } }),
      prisma.transaction.count(),
      prisma.transaction.findMany({
        take: 10,
        orderBy: { timestamp: 'desc' },
        include: { token: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalGroups,
          totalVerifiedUsers,
          totalTrackedTokens,
          totalTransactions,
        },
        recentTransactions,
      },
    });
  } catch (error) {
    logger.error('Error fetching dashboard data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data',
    });
  }
});

/**
 * Get token statistics
 */
app.get('/api/tokens/:tokenId/stats', requireApiKey, async (req, res) => {
  try {
    const { tokenId } = req.params;

    const token = await prisma.trackedToken.findUnique({
      where: { id: tokenId },
    });

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      });
    }

    // Get today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayStats = await prisma.dailyStats.findUnique({
      where: {
        date_chain_tokenAddress: {
          date: today,
          chain: token.chain,
          tokenAddress: token.tokenAddress,
        },
      },
    });

    // Get total stats
    const [buyCount, sellCount, totalVolume] = await Promise.all([
      prisma.transaction.count({
        where: { tokenId, type: 'buy' },
      }),
      prisma.transaction.count({
        where: { tokenId, type: 'sell' },
      }),
      prisma.transaction.aggregate({
        where: { tokenId },
        _sum: { priceUsd: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        token,
        today: todayStats || {
          buyCount: 0,
          sellCount: 0,
          volumeUsd: 0,
          uniqueBuyers: 0,
          uniqueSellers: 0,
        },
        allTime: {
          buyCount,
          sellCount,
          totalVolume: totalVolume._sum.priceUsd || 0,
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching token stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch token stats',
    });
  }
});

/**
 * Send test alert to group
 */
app.post('/api/test-alert', requireApiKey, async (req, res) => {
  try {
    const { groupId, message } = req.body;

    if (!groupId || !message) {
      return res.status(400).json({
        success: false,
        error: 'groupId and message are required',
      });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found',
      });
    }

    await bot.telegram.sendMessage(Number(group.telegramId), message, {
      parse_mode: 'Markdown',
    });

    res.json({
      success: true,
      message: 'Test alert sent successfully',
    });
  } catch (error) {
    logger.error('Error sending test alert:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test alert',
    });
  }
});

/**
 * Error handling middleware
 */
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

/**
 * Start API server
 */
export async function startAPI() {
  try {
    // Connect to database and Redis
    await connectDatabase();
    await connectRedis();

    // Start server
    const server = app.listen(config.port, () => {
      logger.info(`API server running on port ${config.port}`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down API server...');
      server.close(() => {
        logger.info('API server closed');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error('Failed to start API server:', error);
    process.exit(1);
  }
}

export default app;

// Start API if this file is run directly
if (require.main === module) {
  startAPI();
}
