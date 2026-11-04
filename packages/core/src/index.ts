// RFC 7807 Problem Details Error Hierarchy
export {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ValidationError,
  TenantMismatchError,
  RateLimitError,
  InternalServerError,
  ServiceUnavailableError,
  isAppError,
  createProblemEnvelope,
  createSuccessEnvelope,
  createZodProblemEnvelope,
  formatZodInvalidParams,
  type ProblemPayloadInput,
  type ProblemEnvelope,
  type SuccessPayloadInput,
  type SuccessEnvelope,
  type AppErrorOptions,
  type ProblemDetails,
  type InvalidParamDetail,
  type ZodErrorLike,
  type ZodProblemOptions,
} from "./errors/index.js";

// 4:00 AM Operational Clock Engine
export {
  DEFAULT_TURNOVER_HOUR,
  BUSINESS_DATE_REGEX,
  isValidBusinessDate,
  calculateBusinessDate,
  isNightAuditDue,
  addBusinessDays,
  getNextBusinessDate,
  getPreviousBusinessDate,
  getBusinessDateDiffDays,
} from "./clock/index.js";

// Hierarchical RBAC Permission Evaluator
export {
  SUPERUSER_WILDCARD,
  matchPermission,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  requirePermission,
  resolveBranchPermissions,
  evaluateBranchAccess,
  type UserSecurityContext,
  type RolePermissionMapping,
} from "./rbac/index.js";

// Zod Shared Contract Schemas
export {
  paginationQuerySchema,
  paginationMetaSchema,
  apiErrorDetailSchema,
  problemDetailsSchema,
  createSuccessResponseSchema,
  ssoProviderSchema,
  auditEventPayloadSchema,
  managerOverrideRequestSchema,
  type PaginationQuery,
  type PaginationMeta,
  type ApiErrorDetail,
  type ProblemDetailsResponse,
  type SsoProviderConfig,
  type AuditEventPayload,
  type ManagerOverrideRequest,
} from "./schemas/index.js";

export * from "./schemas/platform-auth.js";

export * from "./http/response.js";

// Canonical Domain & Permission Constants
export {
  PERMISSIONS,
  SETTINGS_PERMISSIONS,
  type PermissionCode,
  type SettingsPermissionCode,
  AUDIT_EVENT_TYPES,
  type AuditEventType,
  COUNTRY_OPTIONS,
  type CountryOption,
  DEFAULT_COUNTRY_CODE,
  APP_MANIFESTS,
  getAppManifest,
  type AppManifest,
  RATE_LIMITS,
  TIMEOUTS,
  PLATFORM_CAPABILITIES,
  PLATFORM_CAPABILITY_CODES,
  PLATFORM_CAPABILITY_GROUPS,
  isPlatformCapability,
  getPlatformCapability,
  type PlatformCapability,
  type PlatformCapabilityDefinition,
  type PlatformCapabilityGroup,
  type PlatformCapabilityKey,
  TEMPLATE_SECRET_FINGERPRINTS,
  TEMPLATE_SECRET_PREFIX,
  isTemplateSecret,
  CATALOG_KEYS,
  CATALOG_DEFINITIONS,
  isCatalogKey,
  getCatalogDefinition,
  type CatalogKey,
  type CatalogCodeFormat,
  type CatalogDefinition,
} from "./constants/index.js";

// Platform error-code registry
export {
  PLATFORM_ERROR_CODES,
  PLATFORM_ERROR_CODE,
  isPlatformErrorCode,
  getPlatformErrorDefinition,
  problemTypeForErrorCode,
  type PlatformErrorCode,
  type PlatformErrorDefinition,
} from "./errors/index.js";

// Reference catalog validation
export {
  normalizeCatalogCode,
  validateCatalogCode,
  type CatalogValidationResult,
} from "./catalog/index.js";

// UTC storage and branch-timezone rendering
export {
  formatUtcTimestamp,
  parseUtcTimestamp,
  toUtcInstant,
  isValidIanaTimeZone,
  formatBranchDateTime,
  formatBranchDate,
  formatBranchTime,
  formatBranchDateTimeWithZone,
  type BranchTimeContext,
} from "./time/index.js";


