# Quick Command Reference

## Basic Token Management

| Command | Description | Example |
|---------|-------------|---------|
| `/addtoken <chain> <address> <symbol> [name]` | Add token to tracking | `/addtoken solana DezX... BONK "Bonk Token"` |
| `/removetoken <symbol>` | Remove token | `/removetoken BONK` |
| `/listtokens` | Show all tracked tokens | `/listtokens` |
| `/groupstats` | Show group statistics | `/groupstats` |

## Alert Thresholds

| Command | Description | Example |
|---------|-------------|---------|
| `/setminusd <symbol> <amount>` | Set minimum USD for alerts | `/setminusd BONK 50` |
| `/setthreshold <symbol> <amount>` | Set minimum token amount (legacy) | `/setthreshold BONK 1000000` |
| `/setwhale <symbol> <amount>` | Set whale alert threshold | `/setwhale BONK 5000` |

## Custom Buttons

| Command | Description | Example |
|---------|-------------|---------|
| `/setbuttons <symbol> <text> <url> [...]` | Add up to 3 custom buttons | `/setbuttons BONK "Buy" https://raydium.io "Chart" https://dexscreener.com` |
| `/clearbuttons <symbol>` | Remove custom buttons | `/clearbuttons BONK` |

## Dynamic Emojis

| Command | Description | Example |
|---------|-------------|---------|
| `/setemoji <symbol> [default]` | Enable emoji tiers | `/setemoji BONK default` |
| `/clearemoji <symbol>` | Disable emoji tiers | `/clearemoji BONK` |

**Default Emoji Tiers:**
- 🐟 $0-$50 (Small)
- 🐠 $50-$200 (Medium)
- 🐬 $200-$1,000 (Large)
- 🦈 $1,000-$5,000 (Shark)
- 🐋 $5,000+ (Whale)

## Custom Media

| Command | Description | Example |
|---------|-------------|---------|
| `/setmedia <symbol> <gif\|image\|video> <url>` | Add media to alerts | `/setmedia BONK gif https://giphy.com/celebrate.gif` |
| `/clearmedia <symbol>` | Remove media | `/clearmedia BONK` |

## MEV Blacklist

| Command | Description | Example |
|---------|-------------|---------|
| `/blacklist add <address> [reason]` | Add wallet to blacklist | `/blacklist add 0xae2fc... "MEV bot"` |
| `/blacklist remove <address>` | Remove from blacklist | `/blacklist remove 0xae2fc...` |
| `/blacklist list [chain]` | View blacklist | `/blacklist list ethereum` |

## Buy Competitions

| Command | Description | Example |
|---------|-------------|---------|
| `/competition start <name> [hours] [prize]` | Start competition | `/competition start "Weekend Rally" 48 "1 SOL"` |
| `/competition stop` | End competition | `/competition stop` |
| `/competition leaderboard [limit]` | View leaderboard | `/competition leaderboard 10` |

## Trending

| Command | Description | Example |
|---------|-------------|---------|
| `/trending [limit]` | View trending tokens | `/trending 10` |

## Admin Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Start bot | `/start` |
| `/verify` | Verify user (groups only) | `/verify` |
| `/help` | Show help message | `/help` |

---

## Complete Token Setup Flow

```bash
# 1. Add token
/addtoken solana DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 BONK "Bonk Token"

# 2. Set USD minimum ($50+)
/setminusd BONK 50

# 3. Set whale threshold ($5,000+)
/setwhale BONK 5000

# 4. Enable emojis
/setemoji BONK default

# 5. Add buttons
/setbuttons BONK "Buy on Raydium" https://raydium.io/swap "Chart" https://dexscreener.com

# 6. Add celebration GIF (optional)
/setmedia BONK gif https://media.giphy.com/media/celebration.gif

# 7. Start competition (optional)
/competition start "BONK Rally" 48 "100 USDC"
```

---

## Quick Tips

✅ **Use USD thresholds** instead of token amounts - easier and more accurate
✅ **Enable emojis** for better visual engagement
✅ **Set whale alerts** to create FOMO and community excitement
✅ **Add custom buttons** to drive traffic where you want
✅ **Use competitions** to gamify buying and increase engagement
✅ **MEV bots are auto-filtered** - 15+ known bots pre-loaded

---

## Admin Only Commands

All configuration commands require admin permissions:
- Adding/removing tokens
- Setting thresholds
- Managing buttons, emojis, media
- MEV blacklist management
- Competition management

Regular users can only use:
- `/start`
- `/verify`
- `/help`
- `/trending`
- `/competition leaderboard`
