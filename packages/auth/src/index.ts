export { createAuth, type CreateAuthOptions, type AuthInstance } from "./auth.js";

export {
  AUTH_ERROR_CODES,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  RateLimitError,
} from "./errors.js";

export {
  hashPin,
  verifyPin,
  verifyTerminalPin,
  setTerminalPin,
  clearTerminalRateLimit,
  clearAllTerminalRateLimits,
  verifyManagerOverridePin,
  verifyOverrideToken,
  setManagerOverridePin,
  ARGON2ID_PIN_OPTIONS,
  OVERRIDE_TOKEN_TTL_MS,
  type VerifyTerminalPinParams,
  type SwitchedTerminalUser,
  type SetTerminalPinParams,
  type VerifyManagerOverrideParams,
  type ManagerOverrideVerificationResult,
  type OverrideTokenClaims,
  type VerifyOverrideTokenParams,
  type ValidatedOverrideToken,
  type SetManagerOverridePinParams,
} from "./pin/index.js";

export {
  switchActiveBranch,
  getActiveBranchSession,
  DEFAULT_SESSION_COOKIE_NAME,
  createSessionCookieOptions,
  extractTokenFromHeader,
  extractTokenFromCookie,
  type SwitchBranchParams,
  type BranchContextData,
  type SwitchBranchResult,
  type ActiveSessionDetails,
  type SessionCookieOptions,
} from "./session/index.js";

export {
  resolveSsoProviderByEmail,
  extractDomainFromEmail,
  isPublicEmailDomain,
  PUBLIC_EMAIL_DOMAINS,
  provisionJitSsoUser,
  type SsoDiscoveryResult,
  type ProvisionJitUserParams,
  type JitProvisionedResult,
} from "./sso/index.js";
