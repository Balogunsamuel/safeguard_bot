# Quick Setup Guide

## 📦 Installation Steps

### 1. Prerequisites Check

```bash
# Check Node.js version (need 18+)
node --version

# Check Docker
docker --version
docker-compose --version
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit with your favorite editor
nano .env
```

**Required Variables to Configure:**

```env
# Get from @BotFather on Telegram
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# Your PostgreSQL database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/safeguard_bot?schema=public

# Redis URL
REDIS_URL=redis://localhost:6379

# Generate a strong random API key
ADMIN_API_KEY=$(openssl rand -hex 32)

# Optional: Your Telegram user ID for admin access
ADMIN_USER_IDS=123456789
```

### 3. Quick Start with Docker (Easiest)

```bash
# Start everything
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps

# Stop everything
docker-compose down
```

### 4. Manual Setup (For Development)

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Start database services
docker-compose up -d postgres redis

# Run migrations
npm run prisma:migrate

# Start all services in separate terminals
npm run dev:bot      # Terminal 1
npm run dev:worker   # Terminal 2
npm run dev:api      # Terminal 3
```

## 🤖 Telegram Bot Setup

### Create Your Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Follow the prompts:
   - Bot name: `My Safeguard Bot`
   - Username: `my_safeguard_bot` (must end in 'bot')
4. Copy the token: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
5. Paste into `.env` as `TELEGRAM_BOT_TOKEN`

### Add Bot to Group

1. Create a new Telegram group or use existing
2. Add your bot as a member
3. Promote bot to admin:
   - Group Info → Administrators → Add Administrator
   - Enable: Delete Messages, Ban Users, Invite Users
4. Send `/start` in the group

### Get Your User ID (for Admin Access)

1. Open **@userinfobot** on Telegram
2. Send any message
3. Copy your user ID
4. Add to `.env`: `ADMIN_USER_IDS=123456789`

## 🔗 RPC Endpoints Setup

### Solana (Choose One)

**Option 1: Helius (Recommended)**
```bash
# Sign up at https://helius.xyz
# Free tier: 100 requests/second
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
SOLANA_WS_URL=wss://mainnet.helius-rpc.com/?api-key=YOUR_KEY
HELIUS_API_KEY=your_key_here
```

**Option 2: QuickNode**
```bash
# Sign up at https://quicknode.com
SOLANA_RPC_URL=https://your-endpoint.solana-mainnet.quiknode.pro/YOUR_KEY/
SOLANA_WS_URL=wss://your-endpoint.solana-mainnet.quiknode.pro/YOUR_KEY/
```

**Option 3: Public (Limited)**
```bash
# Free but rate limited
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_WS_URL=wss://api.mainnet-beta.solana.com
```

### Ethereum (Choose One)

**Option 1: Alchemy**
```bash
# Sign up at https://alchemy.com
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
ETHEREUM_WS_URL=wss://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
```

**Option 2: Infura**
```bash
# Sign up at https://infura.io
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY
ETHEREUM_WS_URL=wss://mainnet.infura.io/ws/v3/YOUR_KEY
```

### BSC (Binance Smart Chain)

```bash
# Public endpoints (free)
BSC_RPC_URL=https://bsc-dataseed.binance.org
BSC_WS_URL=wss://bsc-ws-node.nariox.org:443
```

## 🎯 First Steps After Installation

### 1. Verify Installation

```bash
# Check health endpoint
curl http://localhost:3000/health

# Should return:
# {"success":true,"status":"healthy","timestamp":"...","uptime":123}
```

### 2. Add Your First Token

In your Telegram group, send:

```
/addtoken solana So11111111111111111111111111111111111111112 SOL Solana
```

This adds SOL for tracking.

### 3. Set Alert Threshold

```
/setthreshold SOL 1
```

This will alert on transactions > 1 SOL.

### 4. View Tokens

```
/listtokens
```

### 5. Test the Dashboard

```bash
# Navigate to dashboard
cd dashboard

# Install dependencies
npm install

# Start dev server
npm run dev

# Open http://localhost:5173
# Enter your ADMIN_API_KEY when prompted
```

## 📊 Getting Token/Pair Addresses

### For Solana Tokens

1. Go to [Solscan.io](https://solscan.io)
2. Search for your token
3. Copy the "Token Address"

Example for USDC:
```
/addtoken solana EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v USDC "USD Coin"
```

### For EVM Tokens

1. Go to [Etherscan.io](https://etherscan.io) or [BSCScan.com](https://bscscan.com)
2. Search for your token
3. Copy both:
   - Token Contract Address
   - Trading Pair Address (from Uniswap/PancakeSwap)

Example for Ethereum PEPE:
```
/addtoken ethereum 0x6982508145454Ce325dDbE47a25d4ec3d2311933 PEPE "Pepe Token"
```

Note: For EVM tokens, you'll need to set the pair address in the database or via API:
```bash
curl -X PATCH http://localhost:3000/api/tokens/TOKEN_ID \
  -H "X-API-Key: your_key" \
  -H "Content-Type: application/json" \
  -d '{"pairAddress": "0x..."}'
```

## 🔧 Common Issues

### Bot not responding
```bash
# Check logs
docker-compose logs -f app

# Restart bot
docker-compose restart app

# Verify token
echo $TELEGRAM_BOT_TOKEN
```

### Database connection error
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check connection
docker-compose exec postgres psql -U postgres -d safeguard_bot -c "SELECT 1;"

# Reset database (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d
```

### Worker not detecting transactions
```bash
# Check worker logs
docker-compose logs -f worker

# Verify RPC endpoint
curl $SOLANA_RPC_URL

# Check tokens are added
npm run prisma:studio
# Navigate to TrackedToken table
```

### API returning 401 Unauthorized
```bash
# Verify API key matches
echo $ADMIN_API_KEY

# Test with curl
curl -H "X-API-Key: $ADMIN_API_KEY" http://localhost:3000/api/dashboard
```

## 🚀 Production Checklist

Before deploying to production:

- [ ] Change `ADMIN_API_KEY` to a strong random value
- [ ] Set `NODE_ENV=production`
- [ ] Configure `TELEGRAM_WEBHOOK_URL` for your domain
- [ ] Set up SSL/TLS (use Caddy, nginx, or Let's Encrypt)
- [ ] Configure firewall (allow only 80, 443, and SSH)
- [ ] Set up database backups
- [ ] Configure log rotation
- [ ] Set up monitoring (e.g., UptimeRobot, Datadog)
- [ ] Test webhook endpoint is accessible
- [ ] Verify all RPC endpoints work in production
- [ ] Set appropriate rate limits
- [ ] Review and update ADMIN_USER_IDS

## 📝 Useful Commands

```bash
# Database
npm run prisma:studio      # Open database GUI
npm run prisma:migrate     # Create new migration
npx prisma db push         # Push schema without migration

# Docker
docker-compose up -d       # Start in background
docker-compose down        # Stop all services
docker-compose down -v     # Stop and remove volumes
docker-compose logs -f app # Follow logs
docker-compose restart app # Restart service
docker-compose exec app sh # Enter container shell

# Development
npm run dev               # Start all services
npm run dev:bot          # Bot only
npm run dev:worker       # Worker only
npm run dev:api          # API only
npm run build            # Build TypeScript

# Production
npm start                # Start all services
npm run start:bot        # Bot only
npm run start:worker     # Worker only
npm run start:api        # API only
```

## 🔐 Security Best Practices

1. **Never commit `.env` file** - It's in `.gitignore`
2. **Use strong API keys** - Generate with: `openssl rand -hex 32`
3. **Keep dependencies updated** - Run: `npm audit fix`
4. **Use environment variables** - Never hardcode secrets
5. **Enable HTTPS in production** - Use Caddy or nginx with Let's Encrypt
6. **Restrict API access** - Use firewall rules
7. **Monitor logs** - Check for suspicious activity
8. **Backup database regularly** - Set up automated backups

## 📚 Next Steps

1. Read the full [README.md](README.md)
2. Explore the [API documentation](README.md#api-endpoints)
3. Customize message templates in [src/templates/messages.ts](src/templates/messages.ts)
4. Deploy the dashboard to Vercel or Netlify
5. Set up monitoring and alerts
6. Join the community for support

---

Need help? Check the logs first:
```bash
docker-compose logs -f
```

Happy tracking! 🚀
