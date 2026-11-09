/**
 * Value written to impersonation_sessions.endedBy when a tenant administrator,
 * rather than a platform operator, ends a support session (FR-047).
 *
 * This is a persisted wire format shared by the API and the tenant history
 * screen, so it lives in one canonical registry; changing it needs a data
 * migration rather than a rename.
 */
export const SUPPORT_SESSION_TENANT_ACTOR_PREFIX = "tenant:" as const;
