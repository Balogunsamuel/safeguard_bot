# 🧪 Testing Guide - Week 1 Features

## Quick Start Testing

### 1. Database Setup
```bash
cd /home/odernix/web3/telegram-bot

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate dev --name week1_features

# Verify database
npm run prisma:studio  # Opens browser UI
```

### 2. Start Bot
```bash
# Development mode
npm run dev:bot

# Or if you have separate scripts
npm run dev:api &  # API server
npm run dev:bot    # Bot
```

### 3. Start Workers
```bash
# In separate terminals
npm run dev:evm    # EVM worker (Ethereum + BSC)
npm run dev:solana # Solana worker
```

---

## Feature Testing Scenarios

### 🔘 Test 1: Custom Inline Buttons

**Setup:**
```
/addtoken solana So11111111111111111111111111111111111111112 SOL Solana
/setbuttons SOL "Buy on Raydium" https://raydium.io "Chart" https://dexscreener.com/solana/sol
```

**Expected Result:**
- ✅ Buttons saved successfully
- ✅ Next buy alert shows 2 inline buttons
- ✅ Buttons are clickable and link to correct URLs

**Clear:**
```
/clearbuttons SOL
```

---

### 🐟 Test 2: Dynamic Emoji System

**Setup:**
```
/setemoji SOL default
```

**Expected Result:**
- ✅ Default emoji tiers set (🐟 🐠 🐬 🦈 🐋)
- ✅ Small buy ($10) shows 🐟
- ✅ Medium buy ($100) shows 🐠
- ✅ Large buy ($500) shows 🐬
- ✅ Shark buy ($2000) shows 🦈
- ✅ Whale buy ($10000) shows 🐋

**Verify:**
- Check next buy alert - emoji should match USD value

---

### 🎬 Test 3: Custom Media

**Setup:**
```
/setmedia SOL gif https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif
```

**Expected Result:**
- ✅ Media saved successfully
- ✅ Next buy alert includes the GIF above the message
- ✅ GIF plays automatically in Telegram

**Test Other Media:**
```
/setmedia SOL image https://cryptologos.cc/logos/solana-sol-logo.png
/setmedia SOL video https://example.com/celebration.mp4
```

---

### 🐋 Test 4: Whale Alerts

**Setup:**
```
/setwhale SOL 5000
```

**Expected Result:**
- ✅ Whale threshold set to $5,000
- ✅ Buy under $5,000 = normal alert
- ✅ Buy over $5,000 = shows "🐋 WHALE ALERT 🐋" banner

**Verify:**
- Whale indicator only appears for buys >= threshold

---

### 🚫 Test 5: MEV Bot Filtering

**Setup:**
```
/blacklist list
/blacklist add 0xae2fc483527b8ef99eb5d9b44875f005ba1fae13 "jaredfromsubway"
```

**Expected Result:**
- ✅ Shows pre-seeded MEV bots (7 Ethereum, 2 BSC, 2 Solana)
- ✅ New address added to blacklist
- ✅ Transactions from blacklisted wallets DO NOT trigger alerts

**Verify:**
- Check logs for "Skipping alert for blacklisted wallet"

**Remove:**
```
/blacklist remove 0xae2fc483527b8ef99eb5d9b44875f005ba1fae13
```

---

### 🏆 Test 6: Buy Competitions

**Setup:**
```
/competition start "Weekend Rally" 48 "1 SOL Prize"
```

**Expected Result:**
- ✅ Competition created
- ✅ Shows duration and end time
- ✅ Shows prize info

**Check Leaderboard:**
```
/competition leaderboard 5
```

**Expected:**
- ✅ Shows top 5 buyers
- ✅ Displays total volume and buy count
- ✅ Updates in real-time

**End Competition:**
```
/competition stop
```

**Expected:**
- ✅ Shows winner
- ✅ Shows winner's total volume

---

### 🔥 Test 7: Trending System

**Manually Update:**
```typescript
// In node REPL or test script
const trendingService = require('./src/services/trending.service').default;
await trendingService.updateTrendingTokens();
```

**Check Trending:**
```
/trending 10
```

**Expected Result:**
- ✅ Shows top 10 trending tokens
- ✅ Displays buy count and volume from last hour
- ✅ Ranked by trending score

---

## Integration Testing

### Complete Flow Test

1. **Add Token:**
   ```
   /addtoken solana EPjFWdd5AuYJsYPjFjGg2VnqFqBsmNLW2yjv57JFqH BONK Bonk
   ```

2. **Configure Everything:**
   ```
   /setminusd BONK 10
   /setemoji BONK default
   /setwhale BONK 1000
   /setbuttons BONK "Buy" https://raydium.io "Chart" https://dexscreener.com
   /setmedia BONK gif https://media.giphy.com/media/bonk.gif
   ```

3. **Wait for Buy Transaction**

4. **Verify Alert Includes:**
   - ✅ Custom GIF
   - ✅ Emoji based on USD value
   - ✅ Whale indicator (if > $1000)
   - ✅ Custom buttons
   - ✅ Transaction link
   - ✅ NOT from MEV bots

---

## Performance Testing

### Cache Performance
```typescript
// Test emoji service cache
console.time('emoji-first');
await emojiService.getEmojiForValue(tokenId, 500);
console.timeEnd('emoji-first');  // ~50ms (DB query)

console.time('emoji-cached');
await emojiService.getEmojiForValue(tokenId, 500);
console.timeEnd('emoji-cached');  // ~1ms (cached)
```

### MEV Blacklist Speed
```typescript
console.time('mev-check');
await mevService.isBlacklisted('0xae2fc483527b8ef99eb5d9b44875f005ba1fae13', 'ethereum');
console.timeEnd('mev-check');  // ~1ms (cached)
```

---

## Error Scenarios

### Test Invalid Inputs

**Invalid Button URL:**
```
/setbuttons SOL "Buy" not-a-valid-url
```
Expected: ❌ Error message

**Too Many Buttons:**
```
/setbuttons SOL "A" http://a.com "B" http://b.com "C" http://c.com "D" http://d.com
```
Expected: ❌ "Maximum 3 buttons allowed"

**Invalid Media Type:**
```
/setmedia SOL pdf https://example.com/file.pdf
```
Expected: ❌ "Invalid media type"

**Negative Whale Threshold:**
```
/setwhale SOL -100
```
Expected: ❌ "Invalid amount"

---

## Monitoring & Logs

### Check Logs For:

**MEV Filtering:**
```
[DEBUG] Skipping alert for blacklisted wallet: 0xae2fc...
```

**Emoji Selection:**
```
[INFO] Emoji tier set for token abc123: 🦈 (1000-5000)
```

**Whale Detection:**
```
[INFO] Alert sent for buy of SOL in group 123456 [WHALE]
```

**Media Attachment:**
```
[INFO] Media set for token abc123: gif - https://...
```

---

## Database Verification

### Check Data in Prisma Studio
```bash
npm run prisma:studio
```

**Verify:**
1. **TrackedToken** table has new fields:
   - `whaleThresholdUsd`
   - `mediaType`
   - `mediaUrl`
   - `customButtons`

2. **EmojiTier** table has entries
3. **MevBlacklist** table has 11+ entries
4. **Competition** table works
5. **TrendingToken** table updates

---

## Common Issues & Solutions

### Issue: "prisma not found"
**Solution:**
```bash
npm install
npm run prisma:generate
```

### Issue: Bot commands not working
**Solution:**
- Check bot is admin in group
- Verify bot token in .env
- Check logs for errors

### Issue: No buy alerts showing
**Solution:**
- Check workers are running
- Verify RPC URLs are correct
- Check token is tracked: `/listtokens`
- Check threshold: `/setminusd <symbol> 0`

### Issue: Media not showing
**Solution:**
- Verify URL is accessible
- Check file format matches type
- Try different media URL

### Issue: MEV filtering not working
**Solution:**
```bash
# Check blacklist loaded
/blacklist list

# Check logs
grep "blacklist" logs/app.log
```

---

## Success Criteria

### ✅ All Features Working When:

1. **Buttons** - Appear on alerts, clickable
2. **Emojis** - Change based on buy size
3. **Media** - GIF/image/video shows on alerts
4. **Whale** - Large buys show whale indicator
5. **MEV** - Blacklisted wallets don't trigger alerts
6. **Competition** - Leaderboard updates in real-time
7. **Trending** - Shows recent hot tokens
8. **Performance** - Alerts send within 2-5 seconds
9. **No Errors** - Clean logs, no crashes
10. **Multi-chain** - Works on Solana, Ethereum, BSC

---

## Performance Benchmarks

### Expected Performance:
- Alert latency: **2-5 seconds** from transaction
- MEV check: **< 2ms** (cached)
- Emoji lookup: **< 2ms** (cached)
- Button format: **< 1ms**
- Media attachment: **< 100ms**
- Database queries: **< 50ms**

### Load Testing:
- Should handle **100+ transactions/minute**
- Cache hit rate: **> 95%**
- Memory usage: **< 500MB**
- CPU usage: **< 30%** (idle), **< 80%** (load)

---

**Happy Testing!** 🧪✅

Your bot is production-ready with all Week 1 features!