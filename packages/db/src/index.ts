export {
  prisma,
  createTenantPrismaClient,
  getTenantDb,
  getTenantRuntimeClient,
  disconnectTenantRuntimeClient,
  withTenantContext,
  withTransaction,
  withTenantTransaction,
  type TenantContextTransactionOptions,
  type TenantPrismaClient,
} from "./client.js";

export {
  assertQuotaAvailable,
  assertTenantWriteQuotaAvailable,
  databaseQuotaGuard,
  readQuotaAvailability,
  TENANT_CONTEXT_SETTING,
  TENANT_WRITE_QUOTA_KEYS,
  tenantWriteQuotaGuard,
  type QuotaAvailability,
  type QuotaCheckInput,
  type QuotaGuard,
  type QuotaGuardClient,
} from "./quota-guard.js";

export {
  tenantIsolationExtension,
  TenantIsolationViolationError,
  type TenantContext,
} from "./extension.js";

export {
  createPlatformPrismaClient,
  disconnectPlatformPrismaClient,
  type PlatformPrismaClientOptions,
} from "./platform-client.js";

export { seed } from "./seed.js";
export {
  seedPlatformCatalogs,
  type PlatformCatalogSeedClient,
  type PlatformCatalogSeedResult,
} from "./seed-platform-catalogs.js";
export { backfillAppMetadata } from "./backfill-app-metadata.js";
export {
  buildStarterCatalogSeed,
  STARTER_SECTION_BLOCK_TYPES,
  type StarterCatalogSeed,
  type StarterSectionBlockType,
} from "./starter-catalog-seed-data.js";
export {
  SCHEMA_OWNERSHIP,
  assertTableOwnership,
  registeredSchemas,
  SchemaOwnershipViolation,
  type SchemaOwner,
  type TableOwnershipInput,
} from "./schema-registry.js";
export {
  PLATFORM_RETENTION,
  getPlatformRetentionPolicy,
  UnknownRetentionPolicyError,
  type PlatformRetentionPolicy,
  type RetentionDisposition,
} from "./platform-retention.js";

export {
  Prisma,
  PrismaClient,
  OrgStatus,
  UserOrgStatus,
  InvitationStatus,
  PlatformOperatorStatus,
  PlatformAppAvailability,
  PlatformOutboxStatus,
  CmsCatalogKind,
  CmsCatalogScope,
  CmsCatalogStatus,
  MediaAssetKind,
  MediaAssetStatus,
  MediaUsageStatus,
} from "@prisma/client";

export type {
  Organization,
  Address,
  Branch,
  Media,
  OrganizationTaxProfile,
  Role,
  Permission,
  RolePermission,
  User,
  Account,
  Session,
  Verification,
  Passkey,
  UserOrganization,
  UserBranchRole,
  OrganizationInvitation,
  ApiKey,
  SsoConnection,
  InstalledApp,
  AppBranchConfig,
  AuditLog,
  CmsSite,
  CmsPage,
  CmsPageVersion,
  CmsTemplate,
  CmsDomain,
  CmsCatalogItem,
  CmsCatalogItemVersion,
  FeatureFlag,
  FeatureFlagRule,
  FeatureFlagAuditLog,
  PlatformOperator,
  OperatorPasskey,
  OperatorSession,
  OperatorCapability,
  OperatorInvitation,
  LifecycleEvent,
  Quota,
  AppOverride,
  ImpersonationSession,
  AuditEvent,
  OutboxEvent,
  Catalog,
  CatalogValue,
  MediaAsset,
  MediaUsage,
} from "@prisma/client";
