# Safeguard-Style Telegram Bot for Crypto Communities

A production-ready Telegram bot for crypto communities that provides user verification, real-time buy/sell tracking, and trading analytics. Built with TypeScript, supports Solana and EVM chains (Ethereum, BSC, etc.).

## 🚀 Features

### Trading & Analytics
- **Real-time Trade Tracking**: Monitor buy/sell events on Solana and EVM chains
- **Custom Alerts**: Configurable minimum thresholds, whale alerts, custom buttons, media, and emojis
- **Trading Analytics**: Daily statistics, volume tracking, and trending tokens
- **Buy Competitions**: Run competitions with leaderboards
- **MEV Bot Blacklist**: Filter known MEV bots from alerts

### Security & Moderation (Portal System)
- **Advanced Verification**: CAPTCHA challenges (emoji, math, text) with premium user fast-track
- **Trust Level System**: 3-tier reputation system (New, Trusted, VIP) with auto-promotion
- **Spam Control**: 4 protection modes with URL filtering, rate limiting, and auto-moderation
- **Scam Detection**: Unicode attacks, phishing URLs, fake contracts, and keyword filtering
- **Anti-Raid Protection**: Automatic detection and lockdown with configurable thresholds

### Administration
- **Admin Tools**: Complete administrative control via Telegram commands
- **REST API**: Full-featured API for integrations and custom dashboards
- **Self-Hostable**: Deploy on your own infrastructure with Docker

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Bot Commands](#bot-commands)
- [API Endpoints](#api-endpoints)
- [Architecture](#architecture)
- [Development](#development)
- [Production Deployment](#production-deployment)

## 🔧 Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose (for containerized deployment)
- Telegram Bot Token ([How to create](#creating-a-telegram-bot))
- RPC endpoints for blockchain networks (Solana, Ethereum, BSC, etc.)

## 🚀 Quick Start

### 1. Clone the repository

```bash
git clone <repository-url>
cd telegram-bot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your configuration (see [Configuration](#configuration) section).

### 4. Set up the database

```bash
# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate
```

### 5. Start with Docker Compose (Recommended)

```bash
docker-compose up -d
```

Or run services separately in development:

```bash
# Terminal 1: Start the bot
npm run dev:bot

# Terminal 2: Start the blockchain worker
npm run dev:worker

# Terminal 3: Start the API
npm run dev:api
```

### 6. Set up webhook (Production only)

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-domain.com/webhook"
```

## ⚙️ Configuration

### Creating a Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` and follow the instructions
3. Copy the bot token provided
4. Add the bot to your group and promote it to admin

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token from BotFather | Yes | - |
| `TELEGRAM_WEBHOOK_URL` | Webhook URL for production (e.g., https://yourdomain.com/webhook) | No | - |
| `DATABASE_URL` | PostgreSQL connection string | Yes | - |
| `REDIS_URL` | Redis connection string | Yes | redis://localhost:6379 |
| `SOLANA_RPC_URL` | Solana RPC endpoint | No | https://api.mainnet-beta.solana.com |
| `ETHEREUM_RPC_URL` | Ethereum RPC endpoint | No | - |
| `ETHEREUM_WS_URL` | Ethereum WebSocket endpoint | No | - |
| `BSC_RPC_URL` | BSC RPC endpoint | No | - |
| `BSC_WS_URL` | BSC WebSocket endpoint | No | - |
| `HELIUS_API_KEY` | Helius API key for enhanced Solana data | No | - |
| `ADMIN_USER_IDS` | Comma-separated list of admin Telegram user IDs | No | - |
| `ADMIN_API_KEY` | API key for REST API access | Yes | change_me_in_production |

### Getting RPC Endpoints

**Solana:**
- [Helius](https://helius.xyz) - Recommended, includes WebSocket support
- [QuickNode](https://quicknode.com)
- Public RPC: https://api.mainnet-beta.solana.com (rate-limited)

**Ethereum/BSC:**
- [Alchemy](https://alchemy.com) - Ethereum, Polygon
- [QuickNode](https://quicknode.com) - Multi-chain support
- [Infura](https://infura.io) - Ethereum
- Public BSC: https://bsc-dataseed.binance.org (rate-limited)

## 🤖 Bot Commands

### User Commands

- `/start` - Initialize the bot
- `/help` - Show help message
- `/verify` - Verify membership in the group
- `/trustlevel` - Check your trust level and reputation
- `/listtokens` - List all tracked tokens
- `/trending [limit]` - View trending tokens
- `/competition leaderboard` - View buy competition leaderboard

### Admin Commands

#### Token Management
- `/addtoken <chain> <address> <symbol> [name]` - Add a token to track
  ```
  Example: /addtoken solana EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v USDC "USD Coin"
  ```
- `/removetoken <symbol>` - Stop tracking a token
- `/setthreshold <symbol> <amount>` - Set minimum token amount for alerts
- `/setminusd <symbol> <amount>` - Set minimum USD value for alerts
- `/setwhale <symbol> <amount>` - Set whale alert threshold

#### Customization
- `/setbuttons <symbol> <text> <url> [...]` - Add custom buttons to alerts (max 3)
- `/clearbuttons <symbol>` - Remove custom buttons
- `/setemoji <symbol> [default]` - Enable emoji tiers for buy amounts
- `/clearemoji <symbol>` - Disable emoji tiers
- `/setmedia <symbol> <gif|image|video> <url>` - Add media to alerts
- `/clearmedia <symbol>` - Remove media from alerts

#### Portal & Security
- `/setup` - Configure portal system for your group
- `/trustlevel` - Check any user's trust level (reply to message)
- `/promote` - Promote user to next trust level (reply to message)
- `/demote` - Demote user to previous level (reply to message)
- `/spamconfig` - Configure spam control settings
- `/portalstats` - View comprehensive portal statistics
- `/endlockdown` - Manually end raid lockdown
- `/initscam` - Initialize scam detection patterns

#### Moderation
- `/blacklist add <address> [reason]` - Blacklist wallet from alerts
- `/blacklist remove <address>` - Remove wallet from blacklist
- `/blacklist list [chain]` - View blacklisted wallets

#### Competitions & Analytics
- `/competition start <name> [hours] [prize]` - Start a buy competition
- `/competition stop` - End current competition
- `/groupstats` - View detailed group statistics

## 🌐 API Endpoints

All API endpoints require the `X-API-Key` header or `?apiKey=` query parameter.

### Health Check

```bash
GET /health
```

### Groups

```bash
# Get all groups
GET /api/groups

# Get specific group
GET /api/groups/:groupId
```

### Tokens

```bash
# Get all tracked tokens
GET /api/tokens?chain=solana&groupId=<id>

# Get token statistics
GET /api/tokens/:tokenId/stats
```

### Transactions

```bash
# Get transactions
GET /api/transactions?tokenId=<id>&chain=solana&type=buy&limit=50
```

### Statistics

```bash
# Get daily stats
GET /api/stats/daily?chain=solana&tokenAddress=<address>&days=7

# Get dashboard overview
GET /api/dashboard
```

### Testing

```bash
# Send test alert
POST /api/test-alert
Content-Type: application/json

{
  "groupId": "group_id_here",
  "message": "Test alert message"
}
```

### Example API Call

```bash
curl -H "X-API-Key: your_api_key_here" \
  http://localhost:3000/api/dashboard
```

## 🏗️ Architecture

```
┌─────────────────┐
│  Telegram Bot   │ ← User interactions, verification, commands
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   PostgreSQL    │ ← User data, tokens, transactions, stats
└─────────────────┘
         ▲
         │
┌────────┴────────┐
│  Blockchain     │ ← Monitors Solana/EVM chains for swaps
│    Workers      │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│   REST API      │ ← Admin interface, integrations, dashboard
└─────────────────┘
         │
         ▼
┌─────────────────┐
│     Redis       │ ← Caching, rate limiting, queues
└─────────────────┘
```

### Components

1. **Telegram Bot** ([src/bot.ts](src/bot.ts))
   - Handles user verification
   - Processes admin commands
   - Manages group settings

2. **Blockchain Workers** ([src/worker.ts](src/worker.ts))
   - Solana Worker: Monitors Solana DEX transactions
   - EVM Worker: Listens to Uniswap V2 swap events

3. **REST API** ([src/api.ts](src/api.ts))
   - Provides data access
   - Webhook endpoint for Telegram
   - Admin endpoints

4. **Services Layer**
   - **Trading Services:** Price, Token, Transaction, Competition, Trending
   - **User Management:** User, Group, Verification, Trust Level
   - **Security Services:** Spam Control, Scam Blocker, Anti-Raid, Portal
   - **Customization:** Emoji Tiers, Custom Buttons, Media, MEV Blacklist

## 🛠️ Development

### Project Structure

```
telegram-bot/
├── src/
│   ├── config/          # Configuration and environment
│   ├── services/        # Business logic services
│   ├── workers/         # Blockchain monitoring workers
│   ├── templates/       # Message templates
│   ├── utils/           # Utility functions
│   ├── bot.ts          # Telegram bot
│   ├── worker.ts       # Worker coordinator
│   ├── api.ts          # REST API
│   └── index.ts        # Main entry point
├── prisma/
│   └── schema.prisma   # Database schema
├── docker-compose.yml  # Docker services
├── Dockerfile          # Application container
└── package.json
```

### Running in Development

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Start PostgreSQL and Redis with Docker
docker-compose up -d postgres redis

# Run individual services
npm run dev:bot      # Telegram bot
npm run dev:worker   # Blockchain worker
npm run dev:api      # REST API

# Or run all services together
npm run dev
```

### Database Management

```bash
# Create a new migration
npm run prisma:migrate

# Open Prisma Studio (database GUI)
npm run prisma:studio

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

### Viewing Logs

```bash
# Docker logs
docker-compose logs -f app

# Local logs
tail -f logs/combined.log
tail -f logs/error.log
```

## 🚀 Production Deployment

### Docker Deployment (Recommended)

1. **Set up your server** (Ubuntu 22.04 example)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin -y
```

2. **Clone and configure**

```bash
git clone <repository-url>
cd telegram-bot
cp .env.example .env
nano .env  # Edit your configuration
```

3. **Deploy**

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

4. **Set up webhook**

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://yourdomain.com/webhook",
    "secret_token": "your_webhook_secret"
  }'
```

### Platform-Specific Deployments

#### Deploy to Render.com

1. Create a new Web Service
2. Connect your repository
3. Set build command: `npm install && npx prisma generate && npm run build`
4. Set start command: `npx prisma migrate deploy && npm start`
5. Add environment variables from `.env.example`
6. Create PostgreSQL and Redis add-ons

#### Deploy to Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login

# Launch app
flyctl launch

# Set secrets
flyctl secrets set TELEGRAM_BOT_TOKEN=your_token_here
flyctl secrets set DATABASE_URL=your_db_url_here

# Deploy
flyctl deploy
```

### Scaling for Production

For high-traffic deployments, you can run services separately:

```bash
# Start with separate services
docker-compose --profile separate up -d

# This runs:
# - postgres (database)
# - redis (cache)
# - bot (Telegram bot only)
# - worker (blockchain monitoring only)
# - app (API only)
```

### Monitoring

#### Health Checks

```bash
# Check application health
curl http://localhost:3000/health

# Check Docker containers
docker-compose ps
```

#### Metrics

The application logs all events to:
- Console (stdout)
- `logs/combined.log` - All logs
- `logs/error.log` - Errors only

## 📊 Example Message Outputs

### Welcome Message (New Group)
```
🛡️ **Safeguard Bot Activated**

Hello My Crypto Group! I'm here to protect your community and track token activity.

**Features:**
✅ User verification system
📊 Real-time buy/sell tracking
📈 Trading analytics
🔔 Custom alerts

**Getting Started:**
Admins can use /help to see all available commands.

Let's keep this community safe! 🚀
```

### Verification Prompt
```
👋 Welcome, John!

To join this group, please verify you're a real person by clicking the button below.

This is a one-time verification to protect against bots and spam.

[✅ Verify Me] (button)
```

### Buy Alert
```
💰 **New Buy Alert!**

**Token:** $PEPE
**Amount:** 1,000,000.0000 PEPE
**Value:** 2.3000 SOL (~$460.00)
**Wallet:** `7xKx...2yYm`
**Time:** Dec 8, 2024, 10:30 AM

🔗 [View Transaction](https://solscan.io/tx/5z...)
```

### Sell Alert
```
📉 **New Sell Alert**

**Token:** $PEPE
**Amount:** 500,000.0000 PEPE
**Value:** 1.1500 SOL (~$230.00)
**Wallet:** `9bQr...8xPq`
**Time:** Dec 8, 2024, 10:35 AM

🔗 [View Transaction](https://solscan.io/tx/3m...)
```

### Daily Stats
```
📊 **24h Statistics - $PEPE**

**Buys:** 45 (32 unique wallets)
**Sells:** 28 (21 unique wallets)
**Volume:** $125,400.00
**Net Flow:** 🟢 17

Keep up the momentum! 🚀
```

## 🔒 Security Considerations

### General Security
- ✅ Never stores private keys or seed phrases
- ✅ Input sanitization to prevent injection attacks
- ✅ Rate limiting on all endpoints
- ✅ API key authentication for admin endpoints
- ✅ Webhook secret validation
- ✅ Runs as non-root user in Docker
- ✅ Environment variable validation with Zod

### Portal System Security
- ✅ CAPTCHA verification for new members
- ✅ 3-tier trust level system with auto-promotion
- ✅ Advanced spam detection with 4 protection modes
- ✅ Scam detection (Unicode attacks, phishing, fake contracts)
- ✅ Anti-raid protection with automatic lockdown
- ✅ MEV bot blacklist (15+ known bots pre-loaded)
- ✅ Rate limiting per user (messages per minute/hour)
- ✅ URL and Telegram link filtering

## 🐛 Troubleshooting

### Bot not responding
1. Check if the bot is running: `docker-compose ps`
2. View logs: `docker-compose logs -f app`
3. Verify the bot token is correct
4. Ensure the bot is admin in the group

### Alerts not sending
1. Check worker is running: `docker-compose logs -f worker`
2. Verify RPC endpoints are accessible
3. Check token is added with correct address
4. Ensure pair address is set for EVM tokens

### Database errors
1. Check PostgreSQL is running: `docker-compose ps postgres`
2. Run migrations: `docker-compose exec app npx prisma migrate deploy`
3. Check DATABASE_URL is correct

## 📝 License

MIT License - feel free to use this for your projects!

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## 📞 Support

For issues and questions:
- Open a GitHub issue
- Check existing documentation
- Review logs for error messages

---

**Built with ❤️ for the crypto community**
