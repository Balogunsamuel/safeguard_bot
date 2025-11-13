# Installation Notes

## ✅ Successfully Installed!

Both the main application and dashboard dependencies have been installed successfully.

## 🔧 Network Timeout Fixes Applied

If you encounter `npm ERR! code ERR_SOCKET_TIMEOUT` errors in the future, use these fixes:

### Solution 1: Increase npm timeout and use legacy peer deps
```bash
npm config set fetch-timeout 60000
npm config set fetch-retry-mintimeout 20000
npm config set fetch-retry-maxtimeout 120000
npm config set fetch-retries 5
npm install --legacy-peer-deps
```

### Solution 2: Skip post-install scripts
```bash
npm install --legacy-peer-deps --ignore-scripts
```

### Solution 3: Clean install
```bash
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps --ignore-scripts
```

### Solution 4: Use different registry (if needed)
```bash
npm config set registry https://registry.npmmirror.com/
npm install --legacy-peer-deps
# Then switch back
npm config set registry https://registry.npmjs.org/
```

## 📦 Installation Status

### Main Application
- ✅ Dependencies installed
- ✅ TypeScript configured
- ✅ Prisma configured
- ⚠️  Minor warnings about Node 20 requirement (works fine with Node 18)

### Dashboard
- ✅ Dependencies installed
- ✅ React + Vite configured
- ✅ Tailwind CSS configured

## 🚀 Next Steps

### 1. Set up environment variables
```bash
cp .env.example .env
nano .env
```

Fill in:
- `TELEGRAM_BOT_TOKEN` - Get from @BotFather
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `ADMIN_API_KEY` - Generate with: `openssl rand -hex 32`

### 2. Start with Docker (Easiest)
```bash
# Start database services
docker-compose up -d postgres redis

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Start all services
docker-compose up -d
```

### 3. Or start manually in development
```bash
# Terminal 1: Database services
docker-compose up -d postgres redis

# Terminal 2: Generate Prisma and migrate
npm run prisma:generate
npm run prisma:migrate

# Terminal 3: Start bot
npm run dev:bot

# Terminal 4: Start worker
npm run dev:worker

# Terminal 5: Start API
npm run dev:api

# Terminal 6: Start dashboard
cd dashboard
npm run dev
```

### 4. Access the application
- **API**: http://localhost:3000/health
- **Dashboard**: http://localhost:5173
- **Telegram Bot**: Add to your group and send `/start`

## 🐛 Troubleshooting

### Node.js Version Warning
You're using Node.js 18.19.1. Some Solana packages recommend Node 20+, but the app will work fine with Node 18. To upgrade (optional):

```bash
# Using nvm (recommended)
nvm install 20
nvm use 20

# Or using apt
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### If Prisma client not found
```bash
npm run prisma:generate
```

### If database connection fails
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Restart PostgreSQL
docker-compose restart postgres
```

### If Redis connection fails
```bash
# Check Redis is running
docker-compose ps redis

# Restart Redis
docker-compose restart redis
```

## 📚 Documentation

- **Setup Guide**: [SETUP_GUIDE.md](SETUP_GUIDE.md)
- **Full Documentation**: [README.md](README.md)
- **Dashboard Docs**: [dashboard/README.md](dashboard/README.md)

## 🎉 You're Ready!

All dependencies are installed. Follow the **Next Steps** section above to configure and start your bot.

For detailed setup instructions, see [SETUP_GUIDE.md](SETUP_GUIDE.md).
