# Telegram Bot Codebase - Comprehensive Overview

## Executive Summary

This is a production-ready Telegram bot for crypto communities built with TypeScript, Node.js, and Prisma. It provides real-time blockchain monitoring, user verification, trading analytics, and admin controls for managing tokens and alerts across multiple blockchain networks (Solana, Ethereum, BSC).

**Tech Stack:**
- **Runtime:** Node.js 18+
- **Language:** TypeScript
- **Bot Framework:** Telegraf 4.16
- **Database:** SQLite (via Prisma ORM)
- **Cache:** Redis (ioredis)
- **Blockchain:** Web3.js (Solana), ethers.js (EVM)
- **APIs:** Express, Axios, Winston (logging)

---

## 1. PROJECT STRUCTURE & ARCHITECTURE

### Directory Layout

```
src/
├── bot.ts                 # Main bot command handlers and message routing
├── api.ts                 # REST API endpoints for external integrations
├── worker.ts              # Blockchain monitoring orchestrator
├── index.ts               # Application entry point
├── config/
│   └── index.ts           # Environment config with Zod validation
├── services/              # Business logic layer
│   ├── user.service.ts
│   ├── group.service.ts
│   ├── token.service.ts
│   ├── transaction.service.ts
│   ├── price.service.ts       # Price fetching & calculation
│   ├── emoji.service.ts       # Dynamic emoji tier system
│   ├── button.service.ts      # Custom button management
│   ├── media.service.ts       # GIF/image/video handling
│   ├── mev.service.ts         # MEV bot blacklist
│   ├── competition.service.ts # Buy competitions
│   └── trending.service.ts    # Trending tokens calculation
├── workers/               # Blockchain event monitoring
│   ├── solana.worker.ts   # Solana transaction polling
│   └── evm.worker.ts      # EVM chain WebSocket listeners
├── templates/
│   └── messages.ts        # All Telegram message templates
└── utils/
    ├── database.ts        # Prisma client singleton
    ├── redis.ts           # Redis client & cache service
    ├── logger.ts          # Winston logger
    └── formatters.ts      # Format helpers (USD, addresses, etc.)

prisma/
└── schema.prisma          # Complete data schema
```

### Architecture Pattern

The codebase follows a **layered architecture**:

1. **Presentation Layer:** `bot.ts` (Telegram handlers) + `api.ts` (REST endpoints)
2. **Business Logic:** `services/` folder (transaction processing, data aggregation)
3. **Data Access:** Prisma ORM (single source of truth for database)
4. **External Services:** `workers/` (blockchain monitoring), API clients (CoinGecko, DexScreener)
5. **Cross-cutting:** Logging, caching, configuration

---

## 2. DATABASE SCHEMA & DATA MODELS

### Core Models (13 tables)

#### User Management
```
User
├── telegramId (BigInt, unique)
├── username, firstName, lastName
├── isBot (Boolean)
└── verifications → GroupVerification[]

GroupVerification
├── userId, groupId (composite unique)
├── verifiedAt, isVerified
└── Relations: User, Group

Admin
├── telegramId (BigInt, unique)
├── username, role (admin|superadmin)
├── isActive
```

#### Group & Token Management
```
Group
├── telegramId (BigInt, unique)
├── title, type (group|supergroup|channel)
├── isActive
└── Relations: verifications, trackedTokens

TrackedToken
├── groupId, chain, tokenAddress (composite unique)
├── tokenSymbol, tokenName, pairAddress
├── minAmount, minAmountUsd, whaleThresholdUsd
├── mediaType, mediaUrl
├── customButtons (JSON string)
└── Relations: group, transactions, emojiTiers
```

#### Transaction & Analytics
```
Transaction
├── chain_txHash (composite unique)
├── tokenId, walletAddress
├── type (buy|sell), amountToken, amountNative
├── priceUsd, timestamp, blockNumber
├── alertSent (Boolean)
└── Indexes: tokenId, walletAddress, timestamp

DailyStats
├── date_chain_tokenAddress (composite unique)
├── buyCount, sellCount, volumeUsd
├── uniqueBuyers, uniqueSellers
└── Used for: Analytics & trending calculations

TrendingToken
├── chain_tokenAddress_timestamp (composite unique)
├── rank, buyCount1h, volumeUsd1h, score
└── Retention: 7 days (auto-cleaned)
```

#### Features & Configuration
```
EmojiTier
├── tokenId, minUsd, maxUsd, emoji, label
└── Enables: 🐟→🐠→🐬→🦈→🐋 visual feedback

MevBlacklist
├── walletAddress (unique)
├── chain (solana|ethereum|bsc|all)
├── reason, addedBy, isActive
└── Pre-loaded: 15+ known MEV bots

Competition
├── groupId, tokenId (optional)
├── name, description, startTime, endTime
├── isActive, winnerId, prizeInfo, pinnedMessageId
└── Used for: Buy competitions with leaderboards

Config
├── key (unique)
├── value, category
└── For: Dynamic system configuration
```

---

## 3. EXISTING BOT FEATURES & COMMANDS

### User Commands (Public)

| Command | Function |
|---------|----------|
| `/start` | Initialize bot in group |
| `/help` | Show available commands |
| `/verify` | One-click group verification |
| `/listtokens` | View tracked tokens |
| `/groupstats` | Group statistics |
| `/trending [limit]` | Top trending tokens |
| `/competition leaderboard [limit]` | Competition rankings |

### Admin Commands (1114 lines in bot.ts)

#### Token Management
```
/addtoken <chain> <address> <symbol> [name]
/removetoken <symbol>
/setthreshold <symbol> <amount>      # Min token amount for alert
/setminusd <symbol> <amount>         # Min USD value for alert
/setwhale <symbol> <amount>          # Whale alert threshold
```

#### Customization
```
/setbuttons <symbol> <text> <url> [...]    # Up to 3 custom buttons
/clearbuttons <symbol>
/addbutton <symbol> <text> <url>
/setemoji <symbol> [default]                # Enable emoji tiers
/clearemoji <symbol>
/setmedia <symbol> <gif|image|video> <url>
/clearmedia <symbol>
```

#### Security & Moderation
```
/blacklist add <address> [reason]
/blacklist remove <address>
/blacklist list [chain]
```

#### Buy Competitions
```
/competition start <name> [hours] [prize]
/competition stop
/competition leaderboard [limit]
```

---

## 4. AUTHENTICATION & VERIFICATION SYSTEM

### User Verification Flow

1. **New Member Detection:** `bot.on('new_chat_members')` triggers welcome message
2. **Verification Prompt:** Displays inline button "✅ Verify Me"
3. **Callback Handler:** `bot.action(/verify:(\d+)/)` processes click
4. **Database Update:** Creates `GroupVerification` record (one per user per group)
5. **Message Edit:** Shows success confirmation

### Admin Authorization

Two-tier system:
```typescript
// 1. Config-based admins (env: ADMIN_USER_IDS)
if (config.admin.userIds.includes(ctx.from.id)) return true;

// 2. Telegram native admin check
const member = await ctx.telegram.getChatMember(chatId, userId);
return member.status === 'creator' || member.status === 'administrator';
```

### API Authentication
- **Header-based:** `X-API-Key` header
- **Query parameter:** `?apiKey=...`
- **Validation:** Against `config.admin.apiKey`

---

## 5. MESSAGE HANDLERS & COMMAND STRUCTURE

### Command Handler Architecture

**bot.ts organization (1114 lines):**

1. **Middleware (lines 30-45):**
   - Rate limiting via Redis (10 requests/minute default)
   - Blocks spam users with rate limit message

2. **Helper Functions (lines 50-130):**
   - `isAdmin()`: Authorization check
   - `getPairAddress()`: Uniswap V2 pair detection

3. **Command Handlers (lines 134+):**
   - `bot.command()`: Slash command routes
   - `bot.action()`: Inline button callbacks
   - `bot.on()`: Event handlers (new members, etc.)

### Message Template System (messages.ts)

All Telegram messages centralized in templates:
- `welcomeMessage()`: Group onboarding
- `newMemberWelcome()`: User welcome with commands
- `tokenAddedMessage()`: Confirmation
- `verificationSuccess()`: Post-verification
- `helpMessage()`: User help text
- `adminHelpMessage()`: Extended admin help
- Alert message builders (with emoji, buttons, media support)

---

## 6. CONFIGURATION MANAGEMENT

### Environment Variables (config/index.ts)

**Zod Schema Validation:**
```typescript
envSchema = z.object({
  // Application
  NODE_ENV: enum['development'|'production'|'test']
  PORT: number
  
  // Telegram
  TELEGRAM_BOT_TOKEN: string (required)
  TELEGRAM_WEBHOOK_URL?: string (optional)
  TELEGRAM_WEBHOOK_SECRET?: string
  
  // Database
  DATABASE_URL: string (SQLite)
  
  // Redis
  REDIS_URL: string
  
  // Blockchain RPC Endpoints
  SOLANA_RPC_URL: string
  SOLANA_WS_URL: string
  HELIUS_API_KEY?: string
  ETHEREUM_RPC_URL?: string
  ETHEREUM_WS_URL?: string
  BSC_RPC_URL?: string
  BSC_WS_URL?: string
  QUICKNODE_HTTP_URL?: string
  QUICKNODE_WS_URL?: string
  
  // Admin
  ADMIN_USER_IDS: CSV string
  ADMIN_API_KEY: string
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: number (default: 60000)
  RATE_LIMIT_MAX_REQUESTS: number (default: 10)
  
  // Logging
  LOG_LEVEL: enum['error'|'warn'|'info'|'debug']
})
```

**Config Structure:**
```typescript
config = {
  env, port, isDevelopment, isProduction,
  telegram: { token, webhookUrl, webhookSecret },
  database: { url },
  redis: { url },
  blockchain: {
    solana: { rpcUrl, wsUrl, heliusApiKey },
    ethereum: { rpcUrl, wsUrl },
    bsc: { rpcUrl, wsUrl },
    quicknode: { httpUrl, wsUrl }
  },
  admin: { userIds[], apiKey },
  rateLimit: { windowMs, maxRequests },
  logging: { level }
}
```

---

## 7. WORKER IMPLEMENTATIONS

### Solana Worker (solana.worker.ts - 12,630 bytes)

**Architecture:** Polling-based (5-second intervals)

**Flow:**
1. Gets all active Solana tokens from database
2. For each token:
   - `connection.getSignaturesForAddress()`: Fetch recent transactions
   - Check if already processed (duplicate prevention)
   - `connection.getParsedTransaction()`: Parse transaction details
   - `parseSwapTransaction()`: Extract swap data (buy/sell, amounts, wallet)
3. Calculate USD price via:
   - Token unit price (DexScreener API)
   - Fallback: SOL price × native amount
4. Record transaction with duplicate-proof upsert
5. Check thresholds (token amount OR USD value)
6. Send alerts if threshold met
7. Update `alertSent` flag

**Key Features:**
- Handles both token transfers and swaps
- Skips sell alerts (configurable)
- Whale alert threshold support
- Transaction deduplication

### EVM Worker (evm.worker.ts - 12,630 bytes)

**Architecture:** WebSocket event listeners

**Flow:**
1. Initialize WebSocket providers for Ethereum & BSC
2. For each chain and tracked token:
   - Create Pair contract instance (Uniswap V2 ABI)
   - Subscribe to `Swap` events
3. On swap event:
   - Calculate token direction (buy/sell)
   - Extract amounts and recipient wallet
4. Price calculation via:
   - Native token price (ETH/BNB from CoinGecko)
5. Record transaction & send alerts
6. Refresh tracked tokens periodically

**Key Features:**
- Real-time event streaming
- Error handling for WebSocket disconnects
- Automatic chain monitoring refresh

### Worker Orchestration (worker.ts)

```typescript
startWorker()
├── connectDatabase()
├── connectRedis()
├── solanaWorker.start()
└── evmWorker.start()

Graceful shutdown handlers:
├── SIGINT/SIGTERM → shutdown()
├── Uncaught exceptions → log (don't exit)
└── Unhandled rejections → log (don't exit)
```

---

## 8. SERVICES LAYER DEEP DIVE

### Price Service (price.service.ts)

**Features:**
- Multi-source price oracle
- In-memory caching (1 minute TTL)
- Chain-specific calculations

**Methods:**
```typescript
getTokenPriceUsd()
├── Solana path:
│   ├── Try: getDexScreenerTokenPrice() → token amount × unit price
│   └── Fallback: getSolPriceUsd() × amountSol
└── EVM path: getNativePrice() × amountNative

getTokenUnitPrice()  // Individual token price
getTokenMarketCap()  // From DexScreener (FDV fallback)

Private cache methods:
├── getSolPriceUsd()   // CoinGecko API
├── getEthPriceUsd()   // CoinGecko API
├── getBnbPriceUsd()   // CoinGecko API
└── getDexScreenerTokenPrice() // DexScreener API
```

### Token Service (token.service.ts)

```typescript
addTrackedToken(params)
removeTrackedToken(tokenId)
getGroupTokens(groupId)
getActiveTokensByChain(chain)
updateMinAmount(tokenId, amount)
updateMinAmountUsd(tokenId, usdAmount)
getTokenByAddress(chain, address)
```

### Transaction Service (transaction.service.ts)

**Duplicate Prevention:**
```typescript
recordTransaction()
├── Check if exists: findUnique(chain_txHash)
├── Use upsert for atomic write
├── Only update daily stats if new
└── Return existing or newly created record
```

**Daily Stats Aggregation:**
- Automatically increments: buyCount, sellCount, volumeUsd
- Tracks unique buyers/sellers
- Used for trending calculation

### Competition Service (competition.service.ts)

```typescript
createCompetition()     // Start buy competition
endCompetition()        // Mark as complete
getActiveCompetition()  // Current running competition
getLeaderboard()        // Aggregate buys by wallet
autoEndExpiredCompetitions() // Background job
```

**Leaderboard Calculation:**
- Aggregates transactions within time window
- Sorts by total USD volume
- Returns top N wallets with stats

### Emoji Service (emoji.service.ts)

**Tier System:**
```
Default Tiers:
🐟 $0-$50        (Small)
🐠 $50-$200      (Medium)
🐬 $200-$1,000   (Large)
🦈 $1,000-$5,000 (Shark)
🐋 $5,000+       (Whale)
```

**Features:**
- Per-token custom tiers
- In-memory cache (5-minute TTL)
- Dynamic emoji selection by USD value

### MEV Service (mev.service.ts)

```typescript
Pre-loaded KNOWN_MEV_BOTS: 17 addresses
├── Ethereum: 7 bots (jaredfromsubway.eth, etc.)
├── BSC: 2 bots
└── Solana: 2 MEV relayers

Methods:
├── addToBlacklist()       // Add wallet to block
├── removeFromBlacklist()  // Remove wallet
├── checkBlacklist()       // Verify wallet (in-memory cache)
└── isBlacklisted()        // Boolean check
```

### Other Services

| Service | Purpose |
|---------|---------|
| `user.service` | User CRUD, admin checks |
| `group.service` | Group CRUD, verification checks |
| `button.service` | Inline button validation & formatting |
| `media.service` | GIF/image/video URL validation |
| `trending.service` | Hourly trending calculation, ranking |

---

## 9. REST API ENDPOINTS

### Health & Webhook
```
GET  /health                    # Status check
POST /webhook                   # Telegram webhook (secret validated)
```

### Data Endpoints (all require X-API-Key)
```
GET  /api/groups                # List all groups
GET  /api/groups/:groupId       # Group details with verifications
GET  /api/tokens                # List tokens (filterable by chain/groupId)
GET  /api/transactions          # Transaction list (paginable)
GET  /api/stats/daily           # Daily statistics
GET  /api/stats/trending        # Trending tokens
GET  /api/competition/:id       # Competition details
```

### Response Format
```json
{
  "success": boolean,
  "data": [...],
  "error": string // if success: false
}
```

---

## 10. CURRENT FEATURES SUMMARY

### Implemented Features ✅

1. **Blockchain Monitoring**
   - Solana: Polling-based transaction detection
   - EVM: WebSocket event streaming
   - Multi-chain support (Ethereum, BSC)

2. **Transaction Processing**
   - Buy/sell detection
   - USD price calculation (multi-source oracle)
   - Duplicate prevention
   - Daily statistics aggregation

3. **User Management**
   - One-click Telegram verification
   - Per-group verification tracking
   - Admin authorization (config + native)

4. **Alert System**
   - Configurable thresholds (token amount OR USD)
   - Whale alerts (separate threshold)
   - MEV bot filtering (15+ pre-loaded)
   - Custom media (GIF/image/video)
   - Custom buttons (up to 3 per token)

5. **Token Customization**
   - Dynamic emoji tiers (5 default levels)
   - Custom inline buttons
   - Media attachments
   - Per-token minimum thresholds

6. **Buy Competitions**
   - Time-bound competitions
   - Leaderboard generation
   - Winner tracking
   - Pinned message updates

7. **Analytics**
   - Daily buy/sell counts
   - Volume tracking (USD)
   - Trending tokens calculation
   - 1-hour trending scores

8. **Admin Tools**
   - Full token lifecycle management
   - Group statistics
   - Blacklist management
   - Configuration commands

---

## 11. KEY INTEGRATION POINTS FOR PORTAL

### Database Integration
- **Direct Prisma Access:** All services use `prisma` singleton
- **Models Available:** 13 tables with full relationships
- **Real-time Data:** Transactions recorded as they occur

### API Integration
- **REST Endpoints:** Authenticated API for dashboard queries
- **Webhook:** Telegram updates routed through `/webhook`
- **CORS Enabled:** Dashboard can make cross-origin requests

### Service Integration
- **Price Service:** Token prices cached, available for calculation
- **Competition Service:** Leaderboard data ready for display
- **Transaction Service:** Full history with timestamps & USD values
- **Analytics:** Daily stats and trending data available

### Configuration
- **Config Export:** Centralized config available to all modules
- **Environment:** All secrets via .env variables
- **Rate Limiting:** Built-in (can be adjusted per endpoint)

---

## 12. DEPENDENCIES & TECH STACK

### Production Dependencies
```
@prisma/client: ^5.22.0         # ORM
@solana/web3.js: ^1.87.6        # Solana blockchain
axios: ^1.7.0                   # HTTP client
dotenv: ^16.4.0                 # Env loading
ethers: ^6.13.0                 # EVM blockchain
express: ^4.19.0                # Web framework
express-rate-limit: ^7.4.0      # Rate limiting
ioredis: ^5.4.0                 # Redis client
telegraf: ^4.16.0               # Telegram bot
winston: ^3.14.0                # Logging
zod: ^3.23.0                    # Schema validation
```

### Development
```
TypeScript: ^5.4.0
tsx: ^4.15.0                    # TS runner
ESLint + Prettier               # Code quality
Prisma CLI: ^5.22.0             # Migrations
```

---

## 13. CURRENT LIMITATIONS & NOTES

### Known Limitations
1. **Solana:** Polling-based (5-sec intervals) - slight delay vs. real-time
2. **EVM:** WebSocket required - doesn't persist across restarts
3. **Price Oracle:** Multi-source but no guaranteed accuracy
4. **Transaction Dedup:** Relies on hash uniqueness
5. **Trending:** Hourly snapshots only (not real-time updates)

### Production Notes
- SQLite database (consider PostgreSQL for scale)
- Single process (no horizontal scaling)
- Redis optional (cache fails gracefully)
- BigInt handling for Telegram/blockchain IDs

---

## 14. MODIFIED FILES STATUS

The following files have uncommitted changes (per git status):
```
M  src/services/price.service.ts
M  src/templates/messages.ts
M  src/workers/evm.worker.ts
M  src/workers/solana.worker.ts
```

Recent commits:
- c620b63: third commit
- 5f79bf3: second commit
- fddd9b3: Initial commit

