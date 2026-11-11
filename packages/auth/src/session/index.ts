export {
  switchActiveBranch,
  getActiveBranchSession,
  type SwitchBranchParams,
  type BranchContextData,
  type SwitchBranchResult,
  type ActiveSessionDetails,
} from "./branch-context.js";

export {
  listUserTenants,
  switchActiveTenant,
  type UserTenantMembership,
  type SwitchTenantParams,
  type SwitchTenantResult,
} from "./tenant-context.js";

export {
  DEFAULT_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_EPHEMERAL_MAX_AGE_SECONDS,
  SESSION_PERSISTENT_MAX_AGE_SECONDS,
  DEFAULT_KEY_VERSION,
  createSessionCookieOptions,
  extractTokenFromHeader,
  extractTokenFromCookie,
  signSessionToken,
  verifySessionToken,
  isSessionPayloadExpired,
  isSessionPayloadIdleTimedOut,
  encodeSessionPayload,
  decodeSessionPayload,
  type SessionCookieOptions,
  type SessionPayload,
  type UserIdentityContext,
  type TenantSessionContext,
  type SessionAuthorizationContext,
  type SessionLifecycleContext,
  type SessionPreferencesContext,
  type SessionOnboardingContext,
} from "./session-token.js";

export {
  ONBOARDING_STATUS,
  THEME_PREFERENCES,
  VALID_ONBOARDING_STATUSES,
  VALID_THEMES,
  type OnboardingStatus,
  type ThemePreference,
  type UserOnboardingState,
  getUserOnboardingState,
  mergeUserOnboardingState,
} from "./user-state.js";

export {
  extractEffectivePermissions,
  type BranchRoleWithPermissions,
  type PermissionExtractionOptions,
} from "./permissions.js";


export {
  TENANT_SESSION_COOKIE_NAME,
  TENANT_SESSION_COOKIE_PATH,
  createTenantSessionCookieOptions,
  applyTenantSessionCookie,
  clearTenantSessionCookie,
  isTenantSessionHostBound,
  readTenantHostClaim,
  type HostOnlySessionCookieOptions,
  type TenantSessionSameSite,
  type SerializedCookieSink,
} from "../session-cookie.js";
