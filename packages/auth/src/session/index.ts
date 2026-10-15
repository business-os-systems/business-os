export {
  switchActiveBranch,
  getActiveBranchSession,
  type SwitchBranchParams,
  type BranchContextData,
  type SwitchBranchResult,
  type ActiveSessionDetails,
} from "./branch-context.js";

export {
  DEFAULT_SESSION_COOKIE_NAME,
  SESSION_EPHEMERAL_MAX_AGE_SECONDS,
  SESSION_PERSISTENT_MAX_AGE_SECONDS,
  createSessionCookieOptions,
  extractTokenFromHeader,
  extractTokenFromCookie,
  signSessionToken,
  verifySessionToken,
  encodeSessionPayload,
  decodeSessionPayload,
  type SessionCookieOptions,
  type SessionPayload,
  type UserIdentityContext,
  type TenantSessionContext,
  type SessionAuthorizationContext,
  type SessionLifecycleContext,
  type SessionPreferencesContext,
} from "./session-token.js";
