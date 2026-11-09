/**
 * Canonical Platform error-code registry.
 *
 * Each code maps deterministically to a relative RFC 7807 type URI. Routes and
 * clients must reference these constants instead of raw string literals.
 */

export interface PlatformErrorDefinition {
  readonly status: number;
  readonly title: string;
  readonly slug: string;
}

export const PLATFORM_ERROR_CODES = {
  AUTH_REQUIRED: {
    status: 401,
    title: "Authentication Required",
    slug: "/errors/auth-required",
  },
  ADMISSION_DENIED: {
    status: 403,
    title: "Admission Denied",
    slug: "/errors/admission-denied",
  },
  CORS_ORIGIN_DENIED: {
    status: 403,
    title: "Origin Denied",
    slug: "/errors/cors-origin-denied",
  },
  CAPABILITY_DENIED: {
    status: 403,
    title: "Capability Denied",
    slug: "/errors/capability-denied",
  },
  STEP_UP_REQUIRED: {
    status: 403,
    title: "Step-Up Confirmation Required",
    slug: "/errors/step-up-required",
  },
  TENANT_NOT_FOUND: {
    status: 404,
    title: "Tenant Not Found",
    slug: "/errors/tenant-not-found",
  },
  UNKNOWN_CATALOG: {
    status: 404,
    title: "Unknown Catalog",
    slug: "/errors/unknown-catalog",
  },
  LIFECYCLE_CONFLICT: {
    status: 409,
    title: "Lifecycle Conflict",
    slug: "/errors/lifecycle-conflict",
  },
  VERSION_CONFLICT: {
    status: 409,
    title: "Version Conflict",
    slug: "/errors/version-conflict",
  },
  FLAG_NOT_FOUND: {
    status: 404,
    title: "Feature Flag Not Found",
    slug: "/errors/flag-not-found",
  },
  FLAG_EXISTS: {
    status: 409,
    title: "Feature Flag Already Exists",
    slug: "/errors/flag-exists",
  },
  FLAG_VERSION_CONFLICT: {
    status: 409,
    title: "Feature Flag Version Conflict",
    slug: "/errors/flag-version-conflict",
  },
  FLAG_EXPIRED: {
    status: 409,
    title: "Feature Flag Expired",
    slug: "/errors/flag-expired",
  },
  FLAG_LIFECYCLE_INCOMPLETE: {
    status: 409,
    title: "Feature Flag Lifecycle Incomplete",
    slug: "/errors/flag-lifecycle-incomplete",
  },
  QUOTA_CONFLICT: {
    status: 409,
    title: "Quota Conflict",
    slug: "/errors/quota-conflict",
  },
  QUOTA_EXCEEDED: {
    status: 409,
    title: "Quota Exceeded",
    slug: "/errors/quota-exceeded",
  },
  DUPLICATE_CODE: {
    status: 409,
    title: "Duplicate Reference Code",
    slug: "/errors/duplicate-code",
  },
  CATALOG_VERSION_CONFLICT: {
    status: 409,
    title: "Catalog Version Conflict",
    slug: "/errors/catalog-version-conflict",
  },
  LAST_OPERATOR_GUARD: {
    status: 409,
    title: "Last Operator Guard",
    slug: "/errors/last-operator-guard",
  },
  OPERATOR_ALREADY_INVITED: {
    status: 409,
    title: "Operator Already Invited",
    slug: "/errors/operator-already-invited",
  },
  OPERATOR_ALREADY_EXISTS: {
    status: 409,
    title: "Operator Already Exists",
    slug: "/errors/operator-already-exists",
  },
  OPERATOR_NOT_FOUND: {
    status: 404,
    title: "Operator Not Found",
    slug: "/errors/operator-not-found",
  },
  OPERATOR_INVITATION_INVALID: {
    status: 401,
    title: "Operator Invitation Invalid",
    slug: "/errors/operator-invitation-invalid",
  },
  RP_MIGRATION_REQUIRED: {
    status: 401,
    title: "Passkey Re-enrolment Required",
    slug: "/errors/rp-migration-required",
  },
  IMPERSONATION_ALREADY_ACTIVE: {
    status: 409,
    title: "Support Session Already Active",
    slug: "/errors/impersonation-already-active",
  },
  SUPPORT_SESSION_NOT_FOUND: {
    status: 404,
    title: "Support Session Not Found",
    slug: "/errors/support-session-not-found",
  },
  SUPPORT_SESSION_ALREADY_ENDED: {
    status: 409,
    title: "Support Session Already Ended",
    slug: "/errors/support-session-already-ended",
  },
  SUPPORT_SESSION_READ_ONLY: {
    status: 403,
    title: "Support Session Is Read-Only",
    slug: "/errors/support-session-read-only",
  },
  SUPPORT_SESSION_ENDED: {
    status: 401,
    title: "Support Session Ended",
    slug: "/errors/support-session-ended",
  },
  IDEMPOTENCY_CONFLICT: {
    status: 409,
    title: "Idempotency Conflict",
    slug: "/errors/idempotency-conflict",
  },
  INVALID_TRANSITION: {
    status: 422,
    title: "Invalid Lifecycle Transition",
    slug: "/errors/invalid-transition",
  },
  SLUG_MISMATCH: {
    status: 422,
    title: "Confirmation Slug Mismatch",
    slug: "/errors/slug-mismatch",
  },
  UNKNOWN_RESOURCE_KEY: {
    status: 422,
    title: "Unknown Quota Resource",
    slug: "/errors/unknown-resource-key",
  },
  SETTINGS_INVALID: {
    status: 422,
    title: "Invalid Application Settings",
    slug: "/errors/settings-invalid",
  },
  UNKNOWN_APP: {
    status: 422,
    title: "Unknown Application",
    slug: "/errors/unknown-app",
  },
  UNKNOWN_CAPABILITY: {
    status: 422,
    title: "Unknown Capability",
    slug: "/errors/unknown-capability",
  },
  INVALID_CODE_FORMAT: {
    status: 422,
    title: "Invalid Reference Code Format",
    slug: "/errors/invalid-code-format",
  },
  TENANT_NOT_ACTIVE: {
    status: 422,
    title: "Tenant Not Active",
    slug: "/errors/tenant-not-active",
  },
  TENANT_SUSPENDED: {
    status: 403,
    title: "Tenant Suspended",
    slug: "/errors/tenant-suspended",
  },
  TENANT_ARCHIVED: {
    status: 403,
    title: "Tenant Archived",
    slug: "/errors/tenant-archived",
  },
  VALIDATION_FAILED: {
    status: 422,
    title: "Validation Failed",
    slug: "/errors/validation-failed",
  },
  PII_REASON_REQUIRED: {
    status: 422,
    title: "Personal Data Reason Required",
    slug: "/errors/pii-reason-required",
  },
  IDEMPOTENCY_KEY_REQUIRED: {
    status: 422,
    title: "Idempotency Key Required",
    slug: "/errors/idempotency-key-required",
  },
  RATE_LIMITED: {
    status: 429,
    title: "Rate Limit Exceeded",
    slug: "/errors/rate-limited",
  },
  DEPENDENCY_UNAVAILABLE: {
    status: 503,
    title: "Dependency Unavailable",
    slug: "/errors/dependency-unavailable",
  },
  INTERNAL_ERROR: {
    status: 500,
    title: "Internal Server Error",
    slug: "/errors/internal-error",
  },
} as const satisfies Record<string, PlatformErrorDefinition>;

export type PlatformErrorCode = keyof typeof PLATFORM_ERROR_CODES;

/**
 * Canonical code strings. Call sites reference these instead of literals so a
 * registry rename cannot drift from its consumers (CT-6 / XVI.6).
 */
export const PLATFORM_ERROR_CODE = Object.freeze(
  Object.keys(PLATFORM_ERROR_CODES).reduce<Record<string, string>>(
    (codes, code) => {
      codes[code] = code;
      return codes;
    },
    {}
  )
) as Readonly<Record<PlatformErrorCode, PlatformErrorCode>>;

export function isPlatformErrorCode(
  value: string
): value is PlatformErrorCode {
  return Object.prototype.hasOwnProperty.call(PLATFORM_ERROR_CODES, value);
}

export function getPlatformErrorDefinition(
  code: PlatformErrorCode
): PlatformErrorDefinition {
  return PLATFORM_ERROR_CODES[code];
}

export function problemTypeForErrorCode(code: PlatformErrorCode): string {
  return PLATFORM_ERROR_CODES[code].slug;
}
