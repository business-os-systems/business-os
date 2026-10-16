/**
 * Canonical Security & Domain Audit Event Types (Single Source of Truth)
 * Complies with Canonical Domain Constants Law and OWASP ASVS 4.0.3 Audit Trail Requirements.
 */

export const AUDIT_EVENT_TYPES = {
  AUTH_PASSWORD_RESET: "AUTH_PASSWORD_RESET",
  AUTH_ACCOUNT_LINKED: "AUTH_ACCOUNT_LINKED",
  AUTH_PASSKEY_VERIFIED: "AUTH_PASSKEY_VERIFIED",
  AUTH_LOGIN_SUCCESS: "AUTH_LOGIN_SUCCESS",
  AUTH_LOGOUT: "AUTH_LOGOUT",
} as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[keyof typeof AUDIT_EVENT_TYPES];
