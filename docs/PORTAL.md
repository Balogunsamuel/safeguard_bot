# Safeguard-Style Portal System - Complete Implementation Guide

## Overview

This document describes the complete Safeguard-style portal system implementation for the Telegram bot. The system provides enterprise-grade security and verification features for managing Telegram groups.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [Core Services](#core-services)
4. [Key Features](#key-features)
5. [Implementation Status](#implementation-status)
6. [Next Steps](#next-steps)
7. [Usage Examples](#usage-examples)

---

## Architecture Overview

The portal system follows a layered architecture:

```
┌─────────────────────────────────────────────┐
│          Bot Handlers Layer                 │
│  (Commands, Events, Callbacks)              │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│          Service Layer                      │
│  - Portal Service                           │
│  - Verification Service                     │
│  - Trust Level Service                      │
│  - Spam Control Service                     │
│  - Scam Blocker Service                     │
│  - Anti-Raid Service                        │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│          Data Layer (Prisma)                │
│  SQLite/PostgreSQL Database                 │
└─────────────────────────────────────────────┘
```

---

## Database Schema

### New Models Added

#### 1. Portal
Main configuration for each group's portal system.

**Key Fields:**
- `groupId` - Link to the protected group
- `channelId` - Portal channel for verification
- `headerText`, `description` - Customizable portal message
- `mediaType`, `mediaFileId` - Custom media (photo/video/GIF)
- `requireCaptcha` - Enable CAPTCHA verification
- `requirePremiumBypass` - Premium users skip CAPTCHA
- `inviteLinkType` - One-time, time-limited, or permanent
- `spamMode` - Off, standard, strict, anti-raid
- `antiRaidEnabled` - Enable anti-raid protection
- `raidThreshold` - Number of joins to trigger raid mode

#### 2. PortalButton
Custom buttons for portal messages (max 3 recommended).

**Key Fields:**
- `text` - Button label
- `url` - Button destination
- `isVerifyButton` - Mark as verification button

#### 3. TrustLevel
User trust levels and reputation tracking.

**Trust Levels:**
- **Level 1 (New)** 🆕 - Restricted permissions
- **Level 2 (Trusted)** ✅ - Full permissions
- **Level 3 (VIP)** ⭐ - Enhanced privileges

**Metrics:**
- `messageCount` - Total messages sent
- `warningCount` - Rule violations
- `joinedAt` - When user joined
- `isMuted` - Current mute status

**Auto-Promotion:**
- Level 1 → 2: After 24 hours + 10 messages
- Level 2 → 3: After 7 days + 50 messages

#### 4. VerificationAttempt
Tracks user verification challenges.

**Challenge Types:**
- `emoji_match` - Select correct emoji
- `math_challenge` - Simple math problem
- `text_challenge` - Knowledge question

**Status:**
- `pending` - Awaiting completion
- `solved` - Successfully verified
- `failed` - Failed verification
- `expired` - Challenge expired

#### 5. InviteLink
Generated invite links with usage tracking.

**Link Types:**
- `one_time` - Single-use link (member_limit=1)
- `time_limited` - Expires after N seconds
- `permanent` - No restrictions (testing only)

#### 6. SpamConfig
Spam control configuration per group.

**Features:**
- URL filtering with whitelist
- Telegram link blocking
- Contract address filtering
- Rate limiting (messages per minute/hour)
- Auto-mute after warnings
- Slowmode for low trust users

#### 7. ScamPattern
Scam detection rules and patterns.

**Pattern Types:**
- `url` - Phishing domains
- `telegram_link` - Suspicious bots
- `contract` - Fake addresses
- `keyword` - Scam phrases
- `unicode` - Homoglyph attacks

**Severity Levels:**
- `low` - Warning only
- `medium` - Delete message
- `high` - Delete + warn user
- `critical` - Delete + ban user

#### 8. RaidEvent
Anti-raid event tracking and lockdown.

**Features:**
- Detects rapid join patterns
- Auto-enables lockdown mode
- Tracks raid participants
- Auto-resolves after timeout

#### 9. MessageActivity
User message rate limiting and tracking.

**Counters:**
- Messages last minute
- Messages last hour
- Violation count
- Auto-reset timestamps

---

## Core Services

### 1. Verification Service
**File:** [src/services/verification.service.ts](src/services/verification.service.ts)

**Features:**
- ✅ Premium user detection
- ✅ CAPTCHA generation (3 types, 3 difficulties)
- ✅ Challenge verification
- ✅ Attempt tracking
- ✅ Auto-expiration cleanup
- ✅ Statistics tracking

**Key Methods:**
```typescript
// Create verification challenge
createVerificationAttempt(portalId, telegramUserId, username, isPremium, difficulty)

// Verify user's answer
verifyAnswer(attemptId, userAnswer) → { success, inviteLink }

// Get challenge for display
getChallengeData(attemptId) → CaptchaChallenge

// Cleanup expired attempts
cleanupExpiredAttempts()
```

### 2. Trust Level Service
**File:** [src/services/trust-level.service.ts](src/services/trust-level.service.ts)

**Features:**
- ✅ 3-tier trust system
- ✅ Auto-promotion based on time + activity
- ✅ Warning system
- ✅ Mute/unmute management
- ✅ Manual promotion/demotion
- ✅ Group statistics

**Key Methods:**
```typescript
// Initialize new user
initializeTrustLevel(userId, groupId)

// Get user's trust level
getTrustLevel(userId, groupId) → TrustLevelInfo

// Track activity
incrementMessageCount(userId, groupId)

// Moderation
addWarning(userId, groupId, reason)
muteUser(userId, groupId, durationSeconds)
isMuted(userId, groupId) → boolean

// Manual management
promoteUser(userId, groupId)
demoteUser(userId, groupId, reason)
```

### 3. Portal Service
**File:** [src/services/portal.service.ts](src/services/portal.service.ts)

**Features:**
- ✅ Portal creation and configuration
- ✅ Invite link generation (one-time/time-limited)
- ✅ Custom button management
- ✅ Media attachment support
- ✅ Portal message updates
- ✅ Link revocation
- ✅ Statistics tracking

**Key Methods:**
```typescript
// Create/update portal
createOrUpdatePortal(config) → Portal

// Get portal
getPortalByGroupId(groupId) → Portal
getPortalById(portalId) → Portal

// Invite links
generateInviteLink(groupId, portalId, forUserId, ctx) → InviteLink
markInviteLinkUsed(inviteLink, usedBy)
revokeInviteLink(inviteLinkId, ctx)

// Customization
addPortalButton(portalId, button)
updatePortalMedia(portalId, mediaType, mediaFileId)
updatePortalMessage(portalId, ctx)

// Stats
getPortalStats(portalId)
```

### 4. Spam Control Service
**File:** [src/services/spam-control.service.ts](src/services/spam-control.service.ts)

**Features:**
- ✅ 4 spam modes (off, standard, strict, anti-raid)
- ✅ Rate limiting per user
- ✅ URL filtering with whitelist
- ✅ Telegram link detection
- ✅ Contract address blocking
- ✅ Repeated character detection
- ✅ Excessive caps detection
- ✅ Mass mention detection
- ✅ Auto-warn and auto-mute

**Key Methods:**
```typescript
// Check message for spam
checkMessage(groupId, userId, telegramUserId, messageText, userTrustLevel) → SpamCheckResult

// Configuration
getSpamConfig(groupId) → SpamConfig
updateSpamConfig(groupId, updates)
setSpamMode(groupId, mode)

// Whitelist management
whitelistDomain(groupId, domain)
removeWhitelistedDomain(groupId, domain)

// Handle violations
handleSpamViolation(groupId, userId, telegramUserId, result)
```

### 5. Scam Blocker Service
**File:** [src/services/scam-blocker.service.ts](src/services/scam-blocker.service.ts)

**Features:**
- ✅ Unicode homoglyph detection
- ✅ Phishing URL detection
- ✅ Scam keyword filtering
- ✅ Fake contract detection
- ✅ Suspicious Telegram link detection
- ✅ URL shortener flagging
- ✅ Pre-loaded scam patterns
- ✅ Custom pattern management

**Pre-Loaded Patterns:**
- 15+ scam keywords (airdrop, free crypto, etc.)
- 6+ phishing domains
- 8+ URL shorteners
- Unicode attack patterns

**Key Methods:**
```typescript
// Initialize default patterns
initializeScamPatterns()

// Check message
checkMessage(groupId, messageText, userTrustLevel) → ScamCheckResult

// Pattern management
addScamPattern(pattern, type, severity, description)
removeScamPattern(patternId)
toggleScamPattern(patternId)
getActivePatterns()
```

### 6. Anti-Raid Service
**File:** [src/services/anti-raid.service.ts](src/services/anti-raid.service.ts)

**Features:**
- ✅ Real-time join tracking
- ✅ Configurable threshold detection
- ✅ Auto-lockdown mode
- ✅ Raid participant tracking
- ✅ Manual/auto lockdown resolution
- ✅ Ban/kick raid participants
- ✅ Statistics and history

**Key Methods:**
```typescript
// Track new join
trackJoin(groupId, telegramUserId) → RaidDetectionResult

// Check status
isInLockdown(groupId) → boolean
getActiveRaidEvent(groupId) → RaidEvent

// Manual control
endLockdown(groupId, adminUserId)
banRaidParticipants(groupId, raidEventId, ctx)
kickRaidParticipants(groupId, raidEventId, ctx)

// Configuration
updateRaidThreshold(groupId, threshold)
toggleAntiRaid(groupId, enabled)

// Maintenance
autoResolveExpiredLockdowns()
resetJoinTracking(groupId)
```

---

## Key Features

### 🔐 Verification System

**Flow:**
1. User clicks "Verify to Join" button in portal channel
2. Bot detects if user has Telegram Premium
3. Premium users: Fast-track verification
4. Non-premium: CAPTCHA challenge
5. Upon success: Generate one-time invite link
6. User joins group with invite link
7. Initialize trust level (Level 1)

**CAPTCHA Types:**
- **Emoji Match:** Select correct emoji from grid
- **Math Challenge:** Solve simple equation
- **Text Challenge:** Answer trivia question

**Difficulty Levels:**
- **Easy:** 4 options, simple questions
- **Medium:** 6 options, moderate difficulty
- **Hard:** 9 options, complex challenges

### 🎚️ Trust Levels

**Level 1 (New)** 🆕
- Restricted posting (optional)
- URL blocking enabled
- Telegram link blocking
- Higher spam filtering
- Cannot post contract addresses

**Level 2 (Trusted)** ✅
- Full posting permissions
- Moderate spam filtering
- Can post URLs (with limits)
- Auto-promoted after: 24 hours + 10 messages

**Level 3 (VIP)** ⭐
- Enhanced permissions
- Minimal spam filtering
- Priority support
- Auto-promoted after: 7 days + 50 messages

**Warnings System:**
- 1st warning: Notice
- 2nd warning: Temporary restriction
- 3rd warning: Auto-mute or demotion

### 🛡️ Spam Protection

**4 Operating Modes:**

1. **Off:** No filtering
2. **Standard:** Basic rate limiting + URL filtering
3. **Strict:** Enhanced filtering + Level 1 restrictions
4. **Anti-Raid:** Maximum protection during raid events

**Protection Features:**
- Rate limiting (per minute + per hour)
- URL filtering with domain whitelist
- Telegram link blocking
- Contract address filtering
- Repeated character detection
- Excessive caps detection
- Mass mention detection
- Auto-warn and auto-mute

### 🚨 Scam Detection

**Detection Methods:**

1. **Unicode Attacks:**
   - Homoglyph characters (lookalikes)
   - Direction override attacks
   - Visual spoofing

2. **Phishing URLs:**
   - Known phishing domains
   - Suspicious TLDs (.tk, .ml, .ga, etc.)
   - IP addresses in URLs
   - URL shorteners

3. **Scam Keywords:**
   - "Free crypto", "airdrop", "giveaway"
   - Fake support accounts
   - "Verify your wallet"
   - Urgency tactics

4. **Fake Contracts:**
   - Solicitation to send to address
   - Suspicious contract posting patterns

**Action Levels:**
- **Low:** Warning notification
- **Medium:** Delete message
- **High:** Delete + warn user
- **Critical:** Delete + ban user

### ⚔️ Anti-Raid Protection

**Detection:**
- Tracks joins in 60-second window
- Default threshold: 10 joins
- Configurable per group

**Actions on Raid Detection:**
1. Create raid event in database
2. Switch to anti-raid spam mode
3. Enable 30-minute lockdown
4. Track all raid participants
5. Notify admins

**Admin Options:**
- View raid participants
- Ban all participants
- Kick all participants
- End lockdown early
- Adjust threshold

**Auto-Resolution:**
- Lockdowns expire after 30 minutes
- Auto-cleanup task available
- Returns to standard spam mode

---

## Implementation Status

### ✅ Completed

1. **Database Schema**
   - 9 new models added
   - All relationships configured
   - Indexes optimized
   - Migrations applied

2. **Core Services (6 Services)**
   - Verification Service (343 lines)
   - Trust Level Service (408 lines)
   - Portal Service (440 lines)
   - Spam Control Service (397 lines)
   - Scam Blocker Service (436 lines)
   - Anti-Raid Service (356 lines)

3. **Features Implemented**
   - ✅ CAPTCHA system (3 types, 3 difficulties)
   - ✅ Premium user detection
   - ✅ Trust level system (3 tiers)
   - ✅ Auto-promotion logic
   - ✅ Invite link generation
   - ✅ Spam filtering (4 modes)
   - ✅ Scam detection (5 types)
   - ✅ Anti-raid protection
   - ✅ Rate limiting
   - ✅ Warning system
   - ✅ Mute management

### 🔄 Pending (Next Steps)

1. **Bot Handlers**
   - `/setup` - Portal setup wizard
   - `/portalconfig` - Configure portal settings
   - `/spamconfig` - Spam control settings
   - `/trustconfig` - Trust level rules
   - `/buttons` - Manage portal buttons
   - `/setmedia` - Set portal media
   - Verification flow handlers
   - Join event handlers
   - Message filtering handlers

2. **UI/UX**
   - Portal message builder
   - Custom button editor
   - Media upload handler
   - Admin dashboard messages

3. **Background Tasks**
   - Cleanup expired verifications
   - Cleanup expired invite links
   - Auto-resolve lockdowns
   - Trust level auto-promotion
   - Statistics aggregation

4. **Testing**
   - End-to-end verification flow
   - Raid detection simulation
   - Spam filter testing
   - Trust level promotion testing

---

## Next Steps

### Phase 1: Bot Commands (Priority)

Implement the following commands:

#### 1. `/setup` - Portal Setup Wizard
```
Purpose: Interactive setup for group admins
Steps:
1. Select group to protect
2. Select portal channel
3. Configure verification settings
4. Set spam mode
5. Configure trust levels
6. Preview and confirm
```

#### 2. `/portalconfig` - Portal Configuration
```
Commands:
/portalconfig header <text>
/portalconfig description <text>
/portalconfig captcha <on|off>
/portalconfig premium_bypass <on|off>
/portalconfig invites <one_time|time_limited|permanent>
/portalconfig show
```

#### 3. `/spamconfig` - Spam Control
```
Commands:
/spamconfig mode <off|standard|strict|anti_raid>
/spamconfig urls <on|off>
/spamconfig telegram_links <on|off>
/spamconfig whitelist_add <domain>
/spamconfig whitelist_remove <domain>
/spamconfig rate_limit <messages> <minutes>
/spamconfig show
```

#### 4. `/trustconfig` - Trust Levels
```
Commands:
/trustconfig enable <on|off>
/trustconfig level1_duration <hours>
/trustconfig level2_duration <days>
/trustconfig promote <user>
/trustconfig demote <user>
/trustconfig show <user>
```

#### 5. `/buttons` - Portal Buttons
```
Commands:
/buttons add <text> <url>
/buttons remove <index>
/buttons list
```

#### 6. `/setmedia` - Portal Media
```
Usage:
Reply to a photo/video/GIF with /setmedia
Bot will update portal message media
```

### Phase 2: Event Handlers

#### Join Event Handler
```typescript
bot.on('new_chat_members', async (ctx) => {
  // 1. Check if portal exists
  // 2. Track join for anti-raid
  // 3. Check if verified
  // 4. If not verified: mute + send verification challenge
  // 5. Initialize trust level
});
```

#### Message Handler
```typescript
bot.on('message', async (ctx) => {
  // 1. Get user trust level
  // 2. Check spam filters
  // 3. Check scam patterns
  // 4. Increment message count
  // 5. Check for auto-promotion
});
```

#### Verification Callback Handler
```typescript
bot.action(/^verify_/, async (ctx) => {
  // 1. Get verification attempt
  // 2. Show CAPTCHA challenge
  // 3. Wait for answer
  // 4. Verify answer
  // 5. Generate invite link
  // 6. Send to user
});
```

### Phase 3: Background Tasks

Create a cron job or interval task:

```typescript
// Every 5 minutes
setInterval(async () => {
  await verificationService.cleanupExpiredAttempts();
  await portalService.cleanupExpiredLinks();
  await antiRaidService.autoResolveExpiredLockdowns();
}, 5 * 60 * 1000);

// Every hour
setInterval(async () => {
  // Check for trust level promotions
  // Aggregate statistics
}, 60 * 60 * 1000);
```

### Phase 4: Testing

1. **Verification Flow Test:**
   - Create test portal
   - Attempt verification
   - Test all CAPTCHA types
   - Verify invite link works

2. **Spam Filter Test:**
   - Send URLs as Level 1 user
   - Test rate limiting
   - Test scam detection
   - Verify auto-mute works

3. **Raid Detection Test:**
   - Simulate rapid joins
   - Verify lockdown triggers
   - Test participant tracking
   - Verify auto-resolution

---

## Usage Examples

### Example 1: Basic Portal Setup

```typescript
import portalService from './services/portal.service';
import verificationService from './services/verification.service';

// Create portal
const portal = await portalService.createOrUpdatePortal({
  groupId: 'group_123',
  channelId: BigInt(-1001234567890),
  channelUsername: 'mychannel',
  headerText: '🛡️ Welcome to Our Community!',
  description: 'Verify below to join our exclusive group.',
  buttons: [
    { text: '📊 Chart', url: 'https://dexscreener.com/...' },
    { text: '🌐 Website', url: 'https://myproject.io' },
  ],
});

// Initialize scam patterns
await scamBlockerService.initializeScamPatterns();
```

### Example 2: Verification Flow

```typescript
// User clicks verify button
bot.action('verify', async (ctx) => {
  const userId = ctx.from.id;
  const isPremium = ctx.from.is_premium || false;

  // Create verification attempt
  const attempt = await verificationService.createVerificationAttempt(
    portalId,
    BigInt(userId),
    ctx.from.username,
    isPremium,
    'medium'
  );

  // Get challenge
  const challenge = await verificationService.getChallengeData(attempt.id);

  // Display challenge to user
  await ctx.reply(challenge.question, {
    reply_markup: {
      inline_keyboard: challenge.options.map(opt => [
        { text: opt, callback_data: `answer_${attempt.id}_${opt}` }
      ])
    }
  });
});

// User answers
bot.action(/^answer_(.+)_(.+)$/, async (ctx) => {
  const [attemptId, answer] = ctx.match.slice(1);

  const result = await verificationService.verifyAnswer(attemptId, answer);

  if (result.success) {
    await ctx.reply(`✅ Verified! Join here: ${result.inviteLink}`);
  } else {
    await ctx.reply(`❌ ${result.error}. ${result.attemptsRemaining} attempts left.`);
  }
});
```

### Example 3: Message Filtering

```typescript
bot.on('message', async (ctx) => {
  const groupId = ctx.chat.id.toString();
  const userId = ctx.from.id.toString();
  const text = ctx.message.text || '';

  // Get trust level
  const trustLevel = await trustLevelService.getTrustLevel(userId, groupId);

  if (!trustLevel) return;

  // Check spam
  const spamResult = await spamControlService.checkMessage(
    groupId,
    userId,
    BigInt(ctx.from.id),
    text,
    trustLevel.level
  );

  if (spamResult.isSpam) {
    if (spamResult.action === 'delete') {
      await ctx.deleteMessage();
    }
    if (spamResult.action === 'mute') {
      await spamControlService.handleSpamViolation(groupId, userId, BigInt(ctx.from.id), spamResult);
    }
    return;
  }

  // Check scam
  const scamResult = await scamBlockerService.checkMessage(
    groupId,
    text,
    trustLevel.level
  );

  if (scamResult.isScam && scamResult.shouldDelete) {
    await ctx.deleteMessage();
    if (scamResult.shouldBan) {
      await ctx.banChatMember(ctx.from.id);
    }
    return;
  }

  // Track message for trust level
  await trustLevelService.incrementMessageCount(userId, groupId);
});
```

### Example 4: Anti-Raid Protection

```typescript
bot.on('new_chat_members', async (ctx) => {
  const groupId = ctx.chat.id.toString();

  for (const member of ctx.message.new_chat_members) {
    // Track join
    const raidResult = await antiRaidService.trackJoin(
      groupId,
      BigInt(member.id)
    );

    if (raidResult.isRaid) {
      // Raid detected!
      await ctx.reply(
        `🚨 RAID DETECTED! ${raidResult.joinCount} joins in ${raidResult.timeWindow}s.\n` +
        `Lockdown enabled for 30 minutes.`
      );

      // Optional: Immediately ban raid participants
      const raidEvent = await antiRaidService.getActiveRaidEvent(groupId);
      if (raidEvent) {
        await antiRaidService.banRaidParticipants(groupId, raidEvent.id, ctx);
      }
    }
  }
});
```

---

## Performance Considerations

### Optimization Tips

1. **Caching:**
   - Cache portal configs in memory
   - Cache trust levels for active users
   - Cache scam patterns

2. **Database Indexes:**
   - All critical queries have indexes
   - Compound indexes for common queries
   - Monitor slow queries

3. **Rate Limiting:**
   - Use in-memory tracking for recent joins
   - Batch database updates
   - Cleanup old data regularly

4. **Background Tasks:**
   - Run cleanup tasks during low traffic
   - Use job queues for heavy operations
   - Implement retry logic

---

## Security Considerations

### Best Practices

1. **Invite Links:**
   - Always use one-time or time-limited links
   - Revoke unused links periodically
   - Track link usage

2. **Trust Levels:**
   - Start all users at Level 1
   - Require activity for promotion
   - Reset warnings cautiously

3. **Scam Detection:**
   - Keep patterns updated
   - Monitor false positives
   - Allow admin overrides

4. **Anti-Raid:**
   - Adjust threshold per group size
   - Keep lockdown duration reasonable
   - Allow manual resolution

---

## Monitoring and Maintenance

### Key Metrics to Track

1. **Verification:**
   - Success rate
   - Average time to complete
   - Failed attempts per user

2. **Trust Levels:**
   - Distribution across levels
   - Promotion rate
   - Warning rate

3. **Spam/Scam:**
   - Messages blocked
   - False positive rate
   - Top patterns triggered

4. **Anti-Raid:**
   - Raid events per day
   - Average raid size
   - Lockdown duration

### Maintenance Tasks

**Daily:**
- Review raid events
- Check false positives
- Monitor verification success rate

**Weekly:**
- Update scam patterns
- Review trust level distribution
- Audit admin actions

**Monthly:**
- Database cleanup
- Performance optimization
- Feature usage analysis

---

## Troubleshooting

### Common Issues

#### Verification Not Working
- Check portal configuration
- Verify bot permissions in channel
- Check CAPTCHA generation

#### Invite Links Not Working
- Verify bot is admin in group
- Check link expiration settings
- Ensure links not revoked

#### Spam Filter Too Strict
- Adjust spam mode
- Add domains to whitelist
- Review trust level settings

#### Raid Detection False Positives
- Increase raid threshold
- Adjust time window
- Disable during events

---

## API Reference

### Verification Service

```typescript
interface CaptchaChallenge {
  type: 'emoji_match' | 'math_challenge' | 'text_challenge';
  question: string;
  options: string[];
  correctAnswer: string;
  emoji?: string;
}

interface VerificationResult {
  success: boolean;
  isPremium: boolean;
  inviteLink?: string;
  error?: string;
  attemptsRemaining?: number;
}
```

### Trust Level Service

```typescript
enum TrustLevel {
  NEW = 1,
  TRUSTED = 2,
  VIP = 3,
}

interface TrustLevelInfo {
  level: number;
  levelName: string;
  emoji: string;
  description: string;
  joinedAt: Date;
  messageCount: number;
  warningCount: number;
  canBePromoted: boolean;
  nextPromotionAt?: Date;
}
```

### Spam Control Service

```typescript
enum SpamMode {
  OFF = 'off',
  STANDARD = 'standard',
  STRICT = 'strict',
  ANTI_RAID = 'anti_raid',
}

interface SpamCheckResult {
  isSpam: boolean;
  reason?: string;
  action: 'allow' | 'delete' | 'warn' | 'mute';
  shouldNotify: boolean;
}
```

### Scam Blocker Service

```typescript
interface ScamCheckResult {
  isScam: boolean;
  type?: 'url' | 'telegram_link' | 'contract' | 'keyword' | 'unicode' | 'phishing';
  severity?: 'low' | 'medium' | 'high' | 'critical';
  pattern?: string;
  description?: string;
  shouldDelete: boolean;
  shouldBan: boolean;
}
```

### Anti-Raid Service

```typescript
interface RaidDetectionResult {
  isRaid: boolean;
  joinCount: number;
  threshold: number;
  timeWindow: number;
  lockdownEnabled: boolean;
}
```

---

## Credits

**Implementation:** Claude Code
**Architecture:** Safeguard-style portal system
**Database:** Prisma + SQLite/PostgreSQL
**Framework:** Telegraf.js

---

## License

This implementation is part of the Telegram Buy Bot project.

---

**Last Updated:** 2025-11-19
**Version:** 1.0.0
**Status:** Core services complete, handlers pending
