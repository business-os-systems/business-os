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
} from "./account-security.js";

export {
  recordSecurityAuditLog,
  type SecurityAuditParams,
} from "./audit-logger.js";
