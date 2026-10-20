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
  listUserTenants,
  switchActiveTenant,
  type UserTenantMembership,
  type SwitchTenantParams,
  type SwitchTenantResult,
  DEFAULT_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_EPHEMERAL_MAX_AGE_SECONDS,
  SESSION_PERSISTENT_MAX_AGE_SECONDS,
  createSessionCookieOptions,
  extractTokenFromHeader,
  extractTokenFromCookie,
  signSessionToken,
  verifySessionToken,
  isSessionPayloadExpired,
  isSessionPayloadIdleTimedOut,
  encodeSessionPayload,
  decodeSessionPayload,
  type SwitchBranchParams,
  type BranchContextData,
  type SwitchBranchResult,
  type ActiveSessionDetails,
  type SessionCookieOptions,
  type SessionPayload,
  type UserIdentityContext,
  type TenantSessionContext,
  type SessionAuthorizationContext,
  type SessionLifecycleContext,
  type SessionPreferencesContext,
  type SessionOnboardingContext,
  DEFAULT_KEY_VERSION,
  ONBOARDING_STATUS,
  THEME_PREFERENCES,
  VALID_ONBOARDING_STATUSES,
  VALID_THEMES,
  type OnboardingStatus,
  type ThemePreference,
  type UserOnboardingState,
  getUserOnboardingState,
  mergeUserOnboardingState,
  extractEffectivePermissions,
  type BranchRoleWithPermissions,
  type PermissionExtractionOptions,
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

export {
  isProduction,
  isDevelopment,
  isTest,
  getBetterAuthSecret,
} from "./env.js";

export {
  hashPassword,
  verifyPassword,
  validatePasswordComplexity,
  ARGON2ID_PASSWORD_OPTIONS,
  type PasswordComplexityResult,
} from "./password/password-engine.js";

export {
  createEmailVerificationToken,
  verifyEmailToken,
  hashVerificationToken,
  EMAIL_VERIFICATION_EXPIRATION_HOURS,
  EMAIL_VERIFICATION_EXPIRATION_MS,
  type CreateVerificationTokenResult,
  type VerifyEmailResult,
} from "./verification/index.js";

export {
  sendEmail,
  resolveEmailTransporter,
  registerEmailTransporter,
  ConsoleEmailTransporter,
  ResendEmailTransporter,
  type EmailTransporter,
  type EmailTransporterFactory,
  type SendEmailOptions,
  type EmailSendResult,
} from "./email/transporter.js";

export {
  PASSWORD_RESET_EXPIRATION_MINUTES,
  PASSWORD_RESET_EXPIRATION_MS,
  ACCOUNT_LINKING_TICKET_EXPIRATION_MINUTES,
  ACCOUNT_LINKING_TICKET_EXPIRATION_MS,
  createPasswordResetToken,
  verifyPasswordResetToken,
  completePasswordReset,
  createAccountLinkingTicket,
  verifyAccountLinkingTicket,
  linkOAuthAccountWithPassword,
  type PasswordResetTokenResult,
  type VerifyPasswordResetTokenResult,
  type CompletePasswordResetParams,
  type CompletePasswordResetResult,
  type AccountLinkingTicketPayload,
  type CreateAccountLinkingTicketParams,
  type LinkOAuthAccountParams,
  type LinkOAuthAccountResult,
  recordSecurityAuditLog,
  type SecurityAuditParams,
} from "./security/index.js";

export {
  exchangeGoogleCode,
  exchangeGitHubCode,
  exchangeOAuthCode,
  type OAuthUserProfile,
  type OAuthTokenResult,
  type OAuthExchangeResult,
  type OAuthExchangeParams,
} from "./oauth/index.js";



