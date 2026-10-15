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
} from "./session-token.js";
