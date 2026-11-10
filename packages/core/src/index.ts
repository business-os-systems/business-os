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
  isAppId,
  type AppId,
  type AppManifest,
  INSTALLED_APP_SETTINGS_METADATA_KEYS,
  isInstalledAppSettingsMetadataKey,
  type InstalledAppSettingsMetadataKey,
  RATE_LIMITS,
  TIMEOUTS,
  PLATFORM_CAPABILITIES,
  PLATFORM_CAPABILITY_CODES,
  PLATFORM_CAPABILITY_GROUPS,
  PLATFORM_APPS_READ_CAPABILITIES,
  hasPlatformAppsReadAccess,
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
  QUOTA_KEYS,
  QUOTA_RESOURCE_DEFINITIONS,
  QUOTA_KEY_CODES,
  MAX_QUOTA_LIMIT,
  isQuotaKey,
  type QuotaKey,
  type QuotaUnit,
  type QuotaResourceDefinition,
  PII_REASON_HEADER,
  FORM_IDEMPOTENCY_HEADER,
  SUPPORT_SESSION_HEADER,
  STEP_UP_TOKEN_HEADER,
  MAX_STEP_UP_TOKEN_LENGTH,
  APP_CATALOG_AVAILABILITIES,
  MAX_CATALOG_SORT_ORDER,
  type AppCatalogAvailability,
  SUPPORT_SESSION_TENANT_ACTOR_PREFIX,
} from "./constants/index.js";

// App settings schema registry (T090)
export {
  settingsFieldDefinitionSchema,
  getAppSettingsDefinition,
  isSettingsValues,
  validateAppSettings,
  validateTenantAppSettings,
  SETTINGS_FIELD_SCOPES,
  type SettingsScope,
  type AppSettingsDefinition,
  type SettingsFieldDefinition,
  type SettingsValidationIssue,
  type SettingsValidationResult,
  type SettingsValues,
} from "./apps/settings-schemas.js";
export {
  resolveAppSettings,
  settingsValueSourceSchema,
  type ResolvedSetting,
  type ResolvedSettings,
  type SettingsResolutionInput,
  type SettingsValueSource,
} from "./apps/settings-resolution.js";

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

// Tenant lifecycle vocabulary and transition matrix
export {
  TENANT_STATUSES,
  TENANT_STATUS,
  TENANT_LIFECYCLE_ACTIONS,
  TENANT_LIFECYCLE_ACTION,
  TENANT_LIFECYCLE_EVENT_TYPES,
  TENANT_LIFECYCLE_REASON_CODES,
  TENANT_LIFECYCLE_TRANSITIONS,
  TENANT_LIFECYCLE_REASON_MIN_LENGTH,
  TENANT_LIFECYCLE_REASON_MAX_LENGTH,
  BLOCKING_TENANT_STATUSES,
  isTenantStatus,
  normalizeTenantStatus,
  getTenantLifecycleTransition,
  canApplyLifecycleAction,
  resolveRestoreTarget,
  isBlockingTenantStatus,
  type TenantStatus,
  type TenantLifecycleAction,
  type TenantLifecycleTransition,
  type BlockingTenantStatus,
} from "./lifecycle/transitions.js";

export {
  tenantLifecycleEventSchema,
  tenantLifecycleEventDataSchema,
  type TenantLifecycleEvent,
} from "./lifecycle/event-schema.js";

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
// Platform system telemetry contract (FR-031..FR-038)
export * from "./system/contracts.js";
