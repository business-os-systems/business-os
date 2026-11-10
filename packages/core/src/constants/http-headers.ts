/**
 * Header names shared by the API, browser clients and the CORS allow-list.
 * A name that is evaluated in more than one package lives here rather than at
 * each call site.
 */
export const PII_REASON_HEADER = "X-PII-Reason";
/** Website Builder form ingestion uses this header; it is not an alias of the
 * control-plane Idempotency-Key. */
export const FORM_IDEMPOTENCY_HEADER = "x-idempotency-key";
/** Carries the signed support-session ticket that makes tenant writes read-only
 * (FR-050). It must be on the CORS allow-list or a browser preflight rejects
 * the very request the guard exists to inspect. */
export const SUPPORT_SESSION_HEADER = "X-Support-Session";
/** Carries the single-use confirmation token a fresh passkey ceremony issues
 * (FR-046). Destructive Platform routes consume it inside their mutation
 * transaction, and it must be on the CORS allow-list for browser callers. */
export const STEP_UP_TOKEN_HEADER = "x-step-up-token";
/** Upper bound for the opaque token before any signature or Redis work. */
export const MAX_STEP_UP_TOKEN_LENGTH = 4096;
