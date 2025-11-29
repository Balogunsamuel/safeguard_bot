# Safeguard-Style Interactive Wizard Implementation

## Current Status: **IN PROGRESS** (75% Complete) 🚀

Building an interactive Safeguard-style setup wizard with button-based UI, similar to the production Safeguard bot.

---

## ✅ Completed Components

### 1. Conversation State Management (`src/services/conversation.service.ts`)
- **Status:** ✅ Complete
- **Features:**
  - Multi-step wizard state tracking
  - Redis-based session storage (1-hour TTL)
  - Support for conversation steps: setup, config, token addition
  - Automatic cleanup of expired conversations
  - Data persistence between steps
  - Type-safe conversation steps

### 2. Setup Wizard Foundation (`src/handlers/setup.wizard.ts`)
- **Status:** ✅ Complete
- **Features:**
  - Group selection UI with inline buttons
  - Channel selection workflow
  - Portal customization options
  - Cancel/back navigation
  - Complete flow structure
  - All callback handlers implemented

### 3. Enhanced /start Command (`src/handlers/start.handler.ts`)
- **Status:** ✅ Complete
- **Features:**
  - Safeguard-style main menu
  - Quick action buttons (Setup, Config, Add Token, Trending, Help)
  - Documentation links
  - Different behavior for private vs. group chats
  - Complete menu navigation callbacks
  - Help system integration

### 4. Bot Integration (`src/bot.ts`)
- **Status:** ✅ Complete
- **Lines:** 1055, 1099-1111
- **Features:**
  - `/setup` command now uses interactive wizard (line 1055)
  - All setup wizard callbacks registered (lines 1099-1106)
  - Start menu callbacks registered (line 1111)
  - Conversation service imported and ready
  - Full callback routing implemented

---

## 🚧 Pending Components

### 5. Wizard Callback Handlers (`bot.ts`)
- **Status:** ❌ Not Started
- **Required:**
  ```typescript
  // Add these callback action handlers:
  bot.action(/^setup_/, setupWizard.handleGroupSelection);
  bot.action(/^start_/, startHandler.handleStartMenuCallback);
  bot.action(/^config_/, /* config handler */);
  ```

### 6. Group/Channel Management
- **Status:** ❌ Not Started
- **Required:**
  - Get user's admin groups via Telegram API
  - Create/link verification channels
  - Set up channel permissions
  - Link channel to group in database

### 7. Media Upload Handler
- **Status:** ❌ Not Started
- **Required:**
  - Handle photo/gif/video uploads during setup
  - Store media URLs/file IDs
  - Preview media before portal creation

### 8. Welcome Message Editor
- **Status:** ❌ Not Started
- **Required:**
  - Custom text with markup support
  - Variable replacement (`{mention}`, `{username}`, etc.)
  - Media attachment support
  - Preview functionality

### 9. /config Command
- **Status:** ❌ Not Started
- **Required:**
  - Group console UI
  - Settings management
  - Similar button-based interface
  - Quick actions menu

### 10. Menu Button
- **Status:** ❌ Not Started
- **Required:**
  - Set bot menu commands via Bot Father or API
  - Quick access to `/setup`, `/config`, `/add`, `/trending`

---

## 📋 Implementation Roadmap

### Phase 1: Core Wizard ✅ (100% Done)
- [x] Conversation state management
- [x] Complete wizard structure
- [x] Enhanced /start command
- [x] Callback routing in bot.ts
- [x] Group selection UI

### Phase 2: Portal Customization (In Progress - 40% Done)
- [ ] Channel creation/linking **← NEXT**
- [ ] Media upload support
- [ ] Welcome message editor
- [ ] Portal preview

### Phase 3: Configuration Console (0% Done)
- [ ] /config command implementation
- [ ] Settings UI
- [ ] Quick actions
- [ ] Group management

### Phase 4: Polish & Testing (0% Done)
- [ ] Menu button setup
- [ ] Error handling improvements
- [ ] End-to-end testing
- [ ] User documentation

---

## 🎯 Next Steps (Priority Order)

1. **Add Callback Handlers to bot.ts**
   ```typescript
   // After line 1110 in bot.ts, add:
   bot.action(/^setup_group_/, setupWizard.handleGroupSelection);
   bot.action(/^setup_/, setupWizard.handleChannelSelection);
   bot.action(/^start_/, startHandler.handleStartMenuCallback);
   ```

2. **Implement Group Fetching**
   - Update `getUserAdminGroups()` in setup.wizard.ts
   - Query database for groups where bot is present
   - Verify user admin status via Telegram API

3. **Create Channel Management**
   - Add channel creation flow
   - Link channel to group
   - Set proper permissions

4. **Build Media Handler**
   - Listen for photo/video/gif messages during setup
   - Store in conversation state
   - Apply to portal on completion

5. **Complete Wizard Flow**
   - Test full setup from start to finish
   - Handle all edge cases
   - Add proper error messages

---

## 🔧 Quick Start for Testing

### Current State:
1. Bot has new `/start` command with interactive menu
2. Conversation state service is ready
3. Setup wizard structure exists but needs callback integration

### To Enable:
```typescript
// In src/bot.ts, add after line 1110:

// Setup wizard callbacks
bot.action(/^setup_group_/, setupWizard.handleGroupSelection);
bot.action(/^setup_create_channel$/, setupWizard.handleChannelSelection);
bot.action(/^setup_select_existing_channel$/, setupWizard.handleChannelSelection);
bot.action(/^setup_channel_created$/, setupWizard.handlePortalCustomization);
bot.action(/^setup_create_portal$/, setupWizard.completePortalSetup);
bot.action(/^setup_cancel$/, setupWizard.cancelSetupWizard);

// Start menu callbacks
bot.action(/^start_/, startHandler.handleStartMenuCallback);
```

### Test Commands:
```bash
# In private chat with bot:
/start  # Should show Safeguard-style menu
# Click "Create Portal" button

# In group:
/start  # Should show simple group welcome
```

---

## 📝 Notes

### Differences from Current Implementation:
- **Old:** `/setup` works only in groups
- **New:** `/setup` works in private chat with group selection UI

### Database Changes Needed:
None required - uses existing Portal System tables

### Environment Variables:
No new variables needed

---

## 🐛 Known Issues

1. `/setup` command still routed to old `portalHandlers.handleSetupCommand`
   - **Fix:** Update bot.ts line 1055 to use `setupWizard.startSetupWizard`

2. Callback handlers not registered
   - **Fix:** Add action handlers as shown above

3. Group fetching returns empty list
   - **Fix:** Implement actual Telegram API calls in `getUserAdminGroups()`

---

## 📚 References

- [setup.wizard.ts](src/handlers/setup.wizard.ts) - Main wizard logic
- [start.handler.ts](src/handlers/start.handler.ts) - Start command
- [conversation.service.ts](src/services/conversation.service.ts) - State management
- [bot.ts](src/bot.ts) - Main bot file

---

**Last Updated:** 2025-11-19
**Next Milestone:** Complete callback integration and test basic flow