/**
 * Central export file for all services
 *
 * This file provides a single import point for all bot services,
 * making it easier to manage dependencies and maintain consistency.
 */

// Core bot services
export { default as priceService } from './price.service';
export { default as competitionService } from './competition.service';
export { default as trendingService } from './trending.service';
export { default as tokenService } from './token.service';
export { default as userService } from './user.service';
export { default as groupService } from './group.service';

// Portal system services
export { default as portalService } from './portal.service';
export { default as verificationService } from './verification.service';
export { default as trustLevelService } from './trust-level.service';
export { default as spamControlService } from './spam-control.service';
export { default as scamBlockerService } from './scam-blocker.service';
export { default as antiRaidService } from './anti-raid.service';
export { conversationService } from './conversation.service';

// Type exports for verification service
export type {
  CaptchaType,
  CaptchaDifficulty,
  CaptchaChallenge,
  VerificationResult,
} from './verification.service';

// Type exports for trust level service
export {
  TrustLevel,
} from './trust-level.service';

export type {
  TrustLevelInfo,
} from './trust-level.service';

// Type exports for portal service
export type {
  PortalButtonConfig,
  PortalSetupConfig,
} from './portal.service';

// Type exports for spam control service
export {
  SpamMode,
} from './spam-control.service';

export type {
  SpamCheckResult,
} from './spam-control.service';

// Type exports for scam blocker service
export type {
  ScamCheckResult,
} from './scam-blocker.service';

// Type exports for anti-raid service
export type {
  RaidDetectionResult,
} from './anti-raid.service';
