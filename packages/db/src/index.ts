export {
  prisma,
  createTenantPrismaClient,
  getTenantDb,
  withTransaction,
  withTenantTransaction,
  type TenantPrismaClient,
} from "./client.js";

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
export { backfillAppMetadata } from "./backfill-app-metadata.js";


export {
  Prisma,
  PrismaClient,
  OrgStatus,
  UserOrgStatus,
  InvitationStatus,
  PlatformOperatorStatus,
  PlatformAppAvailability,
  PlatformOutboxStatus,
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
} from "@prisma/client";
