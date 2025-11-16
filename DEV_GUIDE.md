# Development Guide

This guide explains how to run the Safeguard Bot and Dashboard during development.

## Prerequisites

Before starting, ensure you have:

- **Node.js 18+** installed
- **Redis** running on localhost:6379
- **Telegram Bot Token** from [@BotFather](https://t.me/botfather)
- **API Keys** for blockchain RPC endpoints (Alchemy, Helius, etc.)

## Initial Setup

### 1. Install Dependencies

```bash
# Install main bot dependencies
npm install

# Install dashboard dependencies
cd dashboard
npm install
cd ..
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL=file:./dev.db

# Redis
REDIS_URL=redis://localhost:6379

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_WEBHOOK_URL=https://your-ngrok-url.ngrok-free.dev/webhook
TELEGRAM_WEBHOOK_SECRET=your_webhook_secret

# Admin Configuration
ADMIN_USER_IDS=your_telegram_user_id
ADMIN_API_KEY=your_generated_api_key_here

# Blockchain RPC Endpoints
SOLANA_RPC_URL=https://solana-mainnet.g.alchemy.com/v2/YOUR_KEY
HELIUS_API_KEY=your_helius_api_key_here
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
BSC_RPC_URL=https://bsc-dataseed.binance.org

# Server Configuration
PORT=3000
NODE_ENV=development
```

Create `dashboard/.env`:

```env
# API Configuration
VITE_API_URL=http://localhost:3000/api
```

### 3. Initialize Database

```bash
# Generate Prisma client
npx prisma generate

# Create/update database schema
npx prisma db push
```

### 4. Start Redis (if not running)

```bash
# Check if Redis is running
redis-cli ping

# If not running, start it:
# On Ubuntu/Debian:
sudo service redis-server start

# On macOS:
brew services start redis
```

## Running the Application

### Method 1: Run All Services Separately (Recommended for Development)

Open **4 separate terminal windows** and run each service:

#### Terminal 1: API Server

```bash
npm run dev:api
```

This starts the Express API server on port 3000 with hot reload.

#### Terminal 2: Telegram Bot

```bash
npm run dev:bot
```

This starts the Telegram bot handler with webhook support.

#### Terminal 3: Blockchain Worker

```bash
npm run dev:worker
```

This starts the worker that monitors blockchain transactions.

#### Terminal 4: Dashboard (Optional)

```bash
cd dashboard
npm run dev
```

This starts the React dashboard on port 5173.

### Method 2: Run Services in Background

You can run services in the background using `&`:

```bash
# Start all services
npm run dev:api &
npm run dev:bot &
npm run dev:worker &

# Start dashboard (in dashboard directory)
cd dashboard && npm run dev &
```

To stop background processes:

```bash
# Find process IDs
ps aux | grep "npm run dev"

# Kill specific process
kill <PID>

# Or kill all node processes (careful!)
pkill -f "npm run dev"
```

## Accessing the Application

### Telegram Bot

1. Open Telegram and search for your bot using its username
2. Start a conversation with `/start`
3. For group features, add the bot to a Telegram group
4. Use `/help` to see available commands

### Dashboard

1. Open your browser and navigate to: `http://localhost:5173`
2. Enter your API key when prompted (same as `ADMIN_API_KEY` in `.env`)
3. View real-time statistics, tracked tokens, and transactions

### API Endpoints

The API server runs on `http://localhost:3000`:

- **Health Check**: `GET http://localhost:3000/health`
- **Dashboard Data**: `GET http://localhost:3000/api/dashboard`
- **Tracked Tokens**: `GET http://localhost:3000/api/tokens`
- **Recent Transactions**: `GET http://localhost:3000/api/transactions`

All `/api/*` endpoints require the `X-API-Key` header:

```bash
curl -H "X-API-Key: your_api_key_here" http://localhost:3000/api/tokens
```

## Common Development Tasks

### Adding a Token to Track

In your Telegram bot, use:

```
/addtoken SYMBOL CHAIN CONTRACT_ADDRESS
```

Example:

```
/addtoken BONK solana DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263
```

### Setting Transaction Threshold

```
/setthreshold SYMBOL AMOUNT
```

Example (50 million BONK):

```
/setthreshold BONK 50000000
```

### Viewing Database (Prisma Studio)

```bash
npx prisma studio
```

Opens a browser interface at `http://localhost:5555` to view/edit database records.

### Checking Logs

Each service outputs logs to the terminal:

- **API Server**: Connection logs, request logs, errors
- **Bot**: Command logs, webhook events
- **Worker**: Transaction detection, alert sending

Look for `[error]` entries in red to identify issues.

### Testing API with curl

```bash
# Health check
curl http://localhost:3000/health

# Get dashboard data
curl -H "X-API-Key: your_api_key_here" http://localhost:3000/api/dashboard

# Get tracked tokens
curl -H "X-API-Key: your_api_key_here" http://localhost:3000/api/tokens

# Get recent transactions
curl -H "X-API-Key: your_api_key_here" http://localhost:3000/api/transactions
```

## Troubleshooting

### Bot Not Receiving Messages

**Issue**: Bot doesn't respond to commands in Telegram.

**Solutions**:
1. Ensure ngrok is running and `TELEGRAM_WEBHOOK_URL` is updated
2. Check that webhook is set correctly:
   ```bash
   curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
   ```
3. Try switching to polling mode (comment out webhook URL in `.env`)

### Worker Not Detecting Transactions

**Issue**: No alerts appear even when transactions occur.

**Solutions**:
1. Check RPC endpoints are valid and have sufficient rate limits
2. Verify token is added correctly: `/listtokens` in Telegram
3. Check threshold isn't too high: `/listthresholds`
4. Review worker logs for RPC errors (429 = rate limited)

### Dashboard Shows "Failed to Load"

**Issue**: Dashboard displays error messages.

**Solutions**:
1. Ensure API server is running (`npm run dev:api`)
2. Verify CORS is enabled in `src/api.ts`
3. Check API key is correct in localStorage (browser DevTools > Application > Local Storage)
4. Open browser console (F12) to see detailed error messages

### Database Errors

**Issue**: Prisma errors or missing tables.

**Solutions**:
1. Regenerate Prisma client:
   ```bash
   npx prisma generate
   ```
2. Push schema changes:
   ```bash
   npx prisma db push
   ```
3. If all else fails, delete `dev.db` and `prisma/dev.db` and start fresh

### Port Already in Use

**Issue**: `EADDRINUSE: address already in use :::3000`

**Solution**:
```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or kill all node processes
pkill node
```

### Redis Connection Failed

**Issue**: `Error: Redis connection failed`

**Solution**:
```bash
# Check Redis status
redis-cli ping

# Start Redis
sudo service redis-server start

# Or on macOS:
brew services start redis
```

## Development Workflow

### Typical Development Session

1. **Start Redis** (if not already running)
   ```bash
   redis-cli ping
   ```

2. **Start API Server**
   ```bash
   npm run dev:api
   ```

3. **Start Bot** (in new terminal)
   ```bash
   npm run dev:bot
   ```

4. **Start Worker** (in new terminal)
   ```bash
   npm run dev:worker
   ```

5. **Start Dashboard** (optional, in new terminal)
   ```bash
   cd dashboard && npm run dev
   ```

6. **Make changes to code** - Services auto-reload with `tsx watch`

7. **Test in Telegram** - Send commands to your bot

8. **View results in Dashboard** - Check http://localhost:5173

### Hot Reload

All services use `tsx watch` which automatically reloads when you save changes to TypeScript files:

- Edit `src/bot.ts` → Bot restarts automatically
- Edit `src/api.ts` → API restarts automatically
- Edit `src/workers/*.ts` → Worker restarts automatically
- Edit `dashboard/src/**/*` → Vite hot-reloads in browser

## Production Deployment

For production deployment instructions, see [README.md](README.md#deployment).

## Additional Resources

- [Telegram Bot API Documentation](https://core.telegram.org/bots/api)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Solana Web3.js Documentation](https://solana-labs.github.io/solana-web3.js/)
- [Express.js Documentation](https://expressjs.com/)
- [React Documentation](https://react.dev/)

## Quick Reference

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | SQLite database path | Yes |
| `REDIS_URL` | Redis connection URL | Yes |
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token | Yes |
| `ADMIN_API_KEY` | API key for dashboard | Yes |
| `ADMIN_USER_IDS` | Comma-separated admin user IDs | Yes |
| `SOLANA_RPC_URL` | Solana RPC endpoint | If tracking Solana |
| `HELIUS_API_KEY` | Helius API key (recommended) | Optional |
| `PORT` | API server port (default: 3000) | No |

### Useful Commands

```bash
# Database
npx prisma generate              # Generate Prisma client
npx prisma db push              # Update database schema
npx prisma studio               # Open database GUI

# Development
npm run dev:api                 # Start API server
npm run dev:bot                 # Start Telegram bot
npm run dev:worker              # Start blockchain worker
npm run build                   # Build for production

# Dashboard
cd dashboard
npm run dev                     # Start development server
npm run build                   # Build for production
npm run preview                 # Preview production build

# Utilities
redis-cli ping                  # Check Redis connection
lsof -i :3000                  # Check what's using port 3000
pkill -f "npm run dev"         # Kill all dev processes
```

### Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Initialize bot |
| `/help` | Show help message |
| `/addtoken SYMBOL CHAIN ADDRESS` | Add token to track |
| `/listtokens` | List all tracked tokens |
| `/setthreshold SYMBOL AMOUNT` | Set alert threshold |
| `/listthresholds` | List all thresholds |
| `/stats SYMBOL` | Get token statistics |
| `/verify` | Verify in group (group only) |

---

**Need help?** Check the logs in your terminal for error messages, or review the troubleshooting section above.
