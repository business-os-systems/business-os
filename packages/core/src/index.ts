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
  isAppError,
  type AppErrorOptions,
  type ProblemDetails,
  type InvalidParamDetail,
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

// Canonical Domain & Permission Constants
export {
  PERMISSIONS,
  type PermissionCode,
  AUDIT_EVENT_TYPES,
  type AuditEventType,
} from "./constants/index.js";

