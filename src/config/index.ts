import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment variable schema for validation
const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'Telegram bot token is required'),
  TELEGRAM_WEBHOOK_URL: z.preprocess((val) => val === '' ? undefined : val, z.string().url().optional()),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  // Database
  DATABASE_URL: z.string().url('Invalid database URL'),

  // Redis
  REDIS_URL: z.string().url('Invalid Redis URL'),

  // Solana
  SOLANA_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),
  SOLANA_WS_URL: z.string().url().default('wss://api.mainnet-beta.solana.com'),
  HELIUS_API_KEY: z.string().optional(),

  // EVM
  ETHEREUM_RPC_URL: z.preprocess((val) => val === '' ? undefined : val, z.string().url().optional()),
  ETHEREUM_WS_URL: z.preprocess((val) => val === '' ? undefined : val, z.string().url().optional()),
  BSC_RPC_URL: z.preprocess((val) => val === '' ? undefined : val, z.string().url().optional()),
  BSC_WS_URL: z.preprocess((val) => val === '' ? undefined : val, z.string().url().optional()),
  QUICKNODE_HTTP_URL: z.preprocess((val) => val === '' ? undefined : val, z.string().url().optional()),
  QUICKNODE_WS_URL: z.preprocess((val) => val === '' ? undefined : val, z.string().url().optional()),

  // Admin
  ADMIN_USER_IDS: z.string().default(''),
  ADMIN_API_KEY: z.string().default('change_me_in_production'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('60000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('10'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

// Parse and validate environment variables
const env = envSchema.parse(process.env);

// Export configuration object
export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',

  telegram: {
    token: env.TELEGRAM_BOT_TOKEN,
    webhookUrl: env.TELEGRAM_WEBHOOK_URL,
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
  },

  database: {
    url: env.DATABASE_URL,
  },

  redis: {
    url: env.REDIS_URL,
  },

  blockchain: {
    solana: {
      rpcUrl: env.SOLANA_RPC_URL,
      wsUrl: env.SOLANA_WS_URL,
      heliusApiKey: env.HELIUS_API_KEY,
    },
    ethereum: {
      rpcUrl: env.ETHEREUM_RPC_URL,
      wsUrl: env.ETHEREUM_WS_URL,
    },
    bsc: {
      rpcUrl: env.BSC_RPC_URL,
      wsUrl: env.BSC_WS_URL,
    },
    quicknode: {
      httpUrl: env.QUICKNODE_HTTP_URL,
      wsUrl: env.QUICKNODE_WS_URL,
    },
  },

  admin: {
    userIds: env.ADMIN_USER_IDS.split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .map(Number),
    apiKey: env.ADMIN_API_KEY,
  },

  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  },

  logging: {
    level: env.LOG_LEVEL,
  },
} as const;

export default config;
