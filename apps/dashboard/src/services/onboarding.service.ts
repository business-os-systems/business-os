import { checkRateLimit, type RateLimitRule } from "@suite/redis";
import { assertTenantWriteQuotaAvailable, prisma, type Prisma } from "@suite/db";
import {
  extractEffectivePermissions,
  getUserOnboardingState,
  mergeUserOnboardingState,
  ONBOARDING_STATUS,
} from "@suite/auth";
import { QUOTA_KEYS, RATE_LIMITS } from "@suite/core";
import { buildInstalledAppSettings } from "./app-manifest-settings";
import { mapBranch } from "./session-mapper";

const ROOT_BRANCH_CODE = "MAIN";
const OWNER_ROLE_SLUG = "owner";
const WILDCARD_PERMISSION = "*";

export interface OnboardingOrganizationDto {
  readonly organizationName: string;
  readonly organizationSlug: string;
  readonly industries: string[];
}

export interface OnboardingBootstrapInput {
  readonly userId: string;
  readonly sessionOrganizationId?: string;
  readonly organizationName: string;
  readonly organizationSlug: string;
  readonly industries: string[];
}

export type OnboardingBootstrapResult =
  | { readonly status: "domain_taken"; readonly race: boolean }
  | {
      readonly status: "bootstrapped";
      readonly organizationId: string;
      readonly organizationName: string;
      readonly branchId: string;
      readonly branchName: string;
      readonly roleName: string;
      readonly permissions: string[];
      readonly userEmail: string;
      readonly userName: string;
    };

export interface OnboardingSelectionResult {
  readonly userEmail: string;
  readonly userName: string;
}

export interface OnboardingCompletionResult {
  readonly userId: string;
  readonly userEmail: string;
  readonly userName: string;
  readonly organizationId: string;
  readonly organizationName?: string;
  readonly activeBranchId?: string;
  readonly activeBranchName?: string;
  readonly roleName?: string;
  readonly permissions: string[];
  readonly installedApps: string[];
}

export type CompleteOnboardingResult =
  | { readonly status: "user_not_found" }
  | { readonly status: "missing_organization" }
  | { readonly status: "completed"; readonly data: OnboardingCompletionResult };

export type SlugRateLimitResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfter: number };

export type BootstrapTransactionInput = OnboardingBootstrapInput & {
  readonly targetExistingOrgId: string | null;
};

function readStringRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function readIndustries(metadata: unknown): string[] {
  const industries = readStringRecord(metadata).industries;
  if (!Array.isArray(industries)) {
    return [];
  }
  return industries.filter((industry): industry is string => typeof industry === "string");
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

export async function getOnboardingOrganization(input: {
  readonly userId: string;
  readonly sessionOrganizationId?: string;
}): Promise<OnboardingOrganizationDto> {
  const dbUser = await prisma.user.findUnique({
    where: { id: input.userId },
    include: { organizations: { include: { organization: true } } },
  });
  const userMetadata = readStringRecord(dbUser?.metadata);
  const targetOrgId =
    input.sessionOrganizationId ??
    readOptionalString(userMetadata, "active_organization_id") ??
    dbUser?.organizations[0]?.organizationId;

  if (!targetOrgId) {
    return { organizationName: "", organizationSlug: "", industries: [] };
  }

  const organization = await prisma.organization.findUnique({ where: { id: targetOrgId } });
  if (!organization) {
    return { organizationName: "", organizationSlug: "", industries: [] };
  }

  return {
    organizationName: organization.name,
    organizationSlug: organization.slug,
    industries: readIndustries(organization.metadata),
  };
}

interface ResolvedBootstrapTarget {
  readonly existingOrganizationId: string | null;
}

async function resolveBootstrapTarget(input: {
  readonly userId: string;
  readonly sessionOrganizationId?: string;
  readonly organizationSlug: string;
}): Promise<
  | { readonly status: "domain_taken" }
  | { readonly status: "resolved"; readonly target: ResolvedBootstrapTarget }
> {
  const memberships = await prisma.userOrganization.findMany({
    where: { userId: input.userId },
    select: { organizationId: true },
  });
  const ownedIds = new Set(memberships.map((membership) => membership.organizationId));
  if (input.sessionOrganizationId) {
    ownedIds.add(input.sessionOrganizationId);
  }

  const existingWithSlug = await prisma.organization.findUnique({
    where: { slug: input.organizationSlug },
    select: { id: true },
  });
  if (existingWithSlug && !ownedIds.has(existingWithSlug.id)) {
    return { status: "domain_taken" };
  }

  return {
    status: "resolved",
    target: {
      existingOrganizationId: pickExistingOrganizationId(
        existingWithSlug,
        ownedIds,
        input.sessionOrganizationId
      ),
    },
  };
}

function pickExistingOrganizationId(
  existingWithSlug: { readonly id: string } | null,
  ownedIds: ReadonlySet<string>,
  sessionOrganizationId: string | undefined
): string | null {
  if (existingWithSlug && ownedIds.has(existingWithSlug.id)) {
    return existingWithSlug.id;
  }
  if (sessionOrganizationId && ownedIds.has(sessionOrganizationId)) {
    return sessionOrganizationId;
  }
  return null;
}

interface OrganizationUpsertInput {
  readonly targetExistingOrgId: string | null;
  readonly organizationName: string;
  readonly organizationSlug: string;
  readonly industries: string[];
}

function upsertOrganization(tx: Prisma.TransactionClient, input: OrganizationUpsertInput) {
  const metadata = { industries: input.industries };
  if (input.targetExistingOrgId) {
    return tx.organization.update({
      where: { id: input.targetExistingOrgId },
      data: {
        name: input.organizationName,
        slug: input.organizationSlug,
        metadata,
      },
    });
  }
  return tx.organization.create({
    data: { name: input.organizationName, slug: input.organizationSlug, metadata },
  });
}

async function ensureRootBranch(tx: Prisma.TransactionClient, organizationId: string) {
  const existing = await tx.branch.findFirst({
    where: { organizationId, code: ROOT_BRANCH_CODE },
  });
  if (existing) {
    return existing;
  }
  // The onboarding branch is a branch write point; a brand-new org has no
  // quota row so this allows, a re-onboarded org is enforced (FR-025).
  await assertTenantWriteQuotaAvailable(tx, {
    organizationId,
    resourceKey: QUOTA_KEYS.BRANCHES,
  });
  return tx.branch.create({
    data: {
      organizationId,
      name: "Main Location",
      code: ROOT_BRANCH_CODE,
      type: "main",
    },
  });
}

async function ensureOwnerMembership(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string
): Promise<void> {
  const existingOwnership = await tx.userOrganization.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  });
  const occupiesSeat = existingOwnership !== null && existingOwnership.status !== "REVOKED";
  if (!occupiesSeat) {
    await assertTenantWriteQuotaAvailable(tx, {
      organizationId,
      resourceKey: QUOTA_KEYS.MEMBERS,
    });
  }
  await tx.userOrganization.upsert({
    where: { userId_organizationId: { userId, organizationId } },
    create: { userId, organizationId, status: "ACTIVE" },
    update: { status: "ACTIVE" },
  });
}

async function ensureOwnerRole(tx: Prisma.TransactionClient, organizationId: string) {
  const existing = await tx.role.findFirst({
    where: { organizationId, slug: OWNER_ROLE_SLUG },
  });
  if (existing) {
    return existing;
  }
  return tx.role.create({
    data: {
      organizationId,
      name: "Organization Owner",
      slug: OWNER_ROLE_SLUG,
      isSystem: true,
    },
  });
}

interface PermissionDelegate {
  readonly findUnique?: (args: { where: { action: string } }) => Promise<{ id: string } | null>;
  readonly findFirst?: (args: { where: { action: string } }) => Promise<{ id: string } | null>;
  readonly create?: (args: {
    data: { appId: string; action: string; description: string };
  }) => Promise<{ id: string }>;
  readonly findMany?: (args: { select: { id: true } }) => Promise<{ id: string }[]>;
}

interface RolePermissionDelegate {
  readonly createMany?: (args: {
    data: { roleId: string; permissionId: string }[];
    skipDuplicates: boolean;
  }) => Promise<unknown>;
  readonly findMany?: (args: {
    where: { roleId: string };
    include: { permission: true };
  }) => Promise<{ permission?: { action?: string | null } | null }[]>;
}

function asDelegate<T>(value: unknown, fallback: T): T {
  if (typeof value !== "object" || value === null) {
    return fallback;
  }
  return value as T;
}

async function ensureWildcardPermission(
  permissionDelegate: PermissionDelegate
): Promise<{ id: string } | null> {
  const findUnique = permissionDelegate.findUnique;
  const findFirst = permissionDelegate.findFirst;
  let wildcard = findUnique ? await findUnique({ where: { action: WILDCARD_PERMISSION } }) : null;
  if (!wildcard && findFirst) {
    wildcard = await findFirst({ where: { action: WILDCARD_PERMISSION } });
  }
  if (wildcard || !permissionDelegate.create) {
    return wildcard;
  }
  return permissionDelegate.create({
    data: {
      appId: "core",
      action: WILDCARD_PERMISSION,
      description:
        "Universal platform administrator access across all domains and modular apps",
    },
  });
}

async function grantCanonicalPermissions(
  tx: Prisma.TransactionClient,
  roleId: string
): Promise<void> {
  const permissionDelegate = asDelegate<PermissionDelegate>(tx.permission, {});
  const rolePermissionDelegate = asDelegate<RolePermissionDelegate>(tx.rolePermission, {});
  await ensureWildcardPermission(permissionDelegate);

  if (permissionDelegate.findMany && rolePermissionDelegate.createMany) {
    const allPermissions = await permissionDelegate.findMany({ select: { id: true } });
    if (allPermissions.length > 0) {
      await rolePermissionDelegate.createMany({
        data: allPermissions.map((permission) => ({ roleId, permissionId: permission.id })),
        skipDuplicates: true,
      });
    }
  }
}

async function ensureOwnerBranchRole(
  tx: Prisma.TransactionClient,
  input: { readonly userId: string; readonly organizationId: string; readonly roleId: string }
): Promise<void> {
  const existing = await tx.userBranchRole.findFirst({
    where: {
      userId: input.userId,
      organizationId: input.organizationId,
      branchId: null,
      roleId: input.roleId,
    },
  });
  if (existing) {
    return;
  }
  await tx.userBranchRole.create({
    data: {
      userId: input.userId,
      organizationId: input.organizationId,
      branchId: null,
      roleId: input.roleId,
    },
  });
}

async function readOwnerPermissions(
  tx: Prisma.TransactionClient,
  roleId: string
): Promise<string[]> {
  const rolePermissionDelegate = asDelegate<RolePermissionDelegate>(tx.rolePermission, {});
  if (!rolePermissionDelegate.findMany) {
    return [];
  }
  const rolePermissions = await rolePermissionDelegate.findMany({
    where: { roleId },
    include: { permission: true },
  });
  return rolePermissions
    .map((entry) => entry.permission?.action)
    .filter((action): action is string => typeof action === "string");
}

async function advanceOnboardingStep(
  tx: Prisma.TransactionClient,
  input: { readonly userId: string; readonly organizationId: string }
) {
  const dbUser = await tx.user.findUnique({
    where: { id: input.userId },
    select: { metadata: true, email: true, name: true },
  });
  const currentMetadata = readStringRecord(dbUser?.metadata);
  await tx.user.update({
    where: { id: input.userId },
    data: {
      metadata: {
        ...currentMetadata,
        current_onboarding_step: 2,
        onboarding_status: ONBOARDING_STATUS.IN_PROGRESS,
        active_organization_id: input.organizationId,
      },
    },
  });
  return dbUser;
}

async function runBootstrapTransaction(input: BootstrapTransactionInput) {
  return prisma.$transaction(async (tx) => {
    const organization = await upsertOrganization(
      tx,
      {
        targetExistingOrgId: input.targetExistingOrgId,
        organizationName: input.organizationName,
        organizationSlug: input.organizationSlug,
        industries: input.industries,
      }
    );
    const branch = await ensureRootBranch(tx, organization.id);
    await ensureOwnerMembership(tx, organization.id, input.userId);
    const ownerRole = await ensureOwnerRole(tx, organization.id);
    await grantCanonicalPermissions(tx, ownerRole.id);
    await ensureOwnerBranchRole(tx, {
      userId: input.userId,
      organizationId: organization.id,
      roleId: ownerRole.id,
    });
    const permissions = await readOwnerPermissions(tx, ownerRole.id);
    const dbUser = await advanceOnboardingStep(tx, {
      userId: input.userId,
      organizationId: organization.id,
    });
    return { organization, branch, ownerRole, permissions, dbUser };
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === "P2002") {
    return true;
  }
  return typeof candidate.message === "string" && candidate.message.includes("Unique constraint failed");
}

export async function bootstrapOrganization(
  input: OnboardingBootstrapInput
): Promise<OnboardingBootstrapResult> {
  const resolved = await resolveBootstrapTarget(input);
  if (resolved.status === "domain_taken") {
    return { status: "domain_taken", race: false };
  }

  try {
    const result = await runBootstrapTransaction({
      ...input,
      targetExistingOrgId: resolved.target.existingOrganizationId,
    });
    return {
      status: "bootstrapped",
      organizationId: result.organization.id,
      organizationName: result.organization.name,
      branchId: result.branch.id,
      branchName: result.branch.name,
      roleName: result.ownerRole.name,
      permissions: result.permissions,
      userEmail: result.dbUser?.email ?? "",
      userName: result.dbUser?.name ?? "",
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { status: "domain_taken", race: true };
    }
    throw error;
  }
}

export async function saveOnboardingSelection(input: {
  readonly userId: string;
  readonly selectedApps: string[];
}): Promise<OnboardingSelectionResult> {
  const dbUser = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { metadata: true, email: true, name: true },
  });
  const updatedMetadata = mergeUserOnboardingState(dbUser?.metadata, {
    selectedApps: input.selectedApps,
    currentOnboardingStep: 3,
    onboardingStatus: ONBOARDING_STATUS.IN_PROGRESS,
  });
  await prisma.user.update({
    where: { id: input.userId },
    data: { metadata: updatedMetadata as Prisma.InputJsonValue },
  });
  return { userEmail: dbUser?.email ?? "", userName: dbUser?.name ?? "" };
}

async function provisionInstalledApps(
  tx: Prisma.TransactionClient,
  input: { readonly organizationId: string; readonly userId: string; readonly appIds: string[] }
): Promise<void> {
  for (const appId of input.appIds) {
    const { manifest, settings } = buildInstalledAppSettings(appId, input.userId);
    await tx.installedApp.upsert({
      where: { organizationId_appId: { organizationId: input.organizationId, appId } },
      create: {
        organizationId: input.organizationId,
        appId,
        version: manifest?.version ?? "1.0.0",
        isEnabled: true,
        settings,
      },
      update: { isEnabled: true, settings },
    });
  }
}

function findCompletionUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      organizations: { include: { organization: true } },
      branchRoles: {
        include: {
          branch: true,
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
    },
  });
}

type CompletionUser = NonNullable<Awaited<ReturnType<typeof findCompletionUser>>>;

function readBranchRoleName(
  branchRole: { readonly role?: { readonly name?: string } | null } | undefined
): string | undefined {
  return branchRole?.role?.name;
}

function buildCompletionResult(
  dbUser: CompletionUser,
  organizationId: string,
  appIds: string[]
): OnboardingCompletionResult {
  const activeOrganization = dbUser.organizations.find(
    (membership) => membership.organizationId === organizationId
  )?.organization;
  const branchRole = dbUser.branchRoles.find((role) => role.organizationId === organizationId);
  const branch = mapBranch(branchRole);

  return {
    userId: dbUser.id,
    userEmail: dbUser.email,
    userName: dbUser.name,
    organizationId,
    organizationName: activeOrganization?.name,
    activeBranchId: branchRole?.branch?.id,
    activeBranchName: branch.activeBranchName,
    roleName: readBranchRoleName(branchRole),
    permissions: extractEffectivePermissions(dbUser.branchRoles, {
      branchId: branch.activeBranchId,
    }),
    installedApps: appIds,
  };
}

export async function completeOnboarding(input: {
  readonly userId: string;
  readonly sessionOrganizationId?: string;
  readonly selectedApps?: string[];
}): Promise<CompleteOnboardingResult> {
  const dbUser = await findCompletionUser(input.userId);
  if (!dbUser) {
    return { status: "user_not_found" };
  }

  const organizationId = input.sessionOrganizationId ?? dbUser.organizations[0]?.organizationId;
  if (!organizationId) {
    return { status: "missing_organization" };
  }

  const onboarding = getUserOnboardingState(dbUser.metadata);
  const requestedApps = input.selectedApps && input.selectedApps.length > 0 ? input.selectedApps : undefined;
  const appIds = requestedApps ?? onboarding.selectedApps;

  await prisma.$transaction(async (tx) => {
    await provisionInstalledApps(tx, { organizationId, userId: dbUser.id, appIds });
    const updatedMetadata = mergeUserOnboardingState(dbUser.metadata, {
      selectedApps: appIds,
      onboardingStatus: ONBOARDING_STATUS.COMPLETED,
      currentOnboardingStep: null,
    });
    await tx.user.update({
      where: { id: dbUser.id },
      data: { metadata: updatedMetadata as Prisma.InputJsonValue },
    });
  });

  return { status: "completed", data: buildCompletionResult(dbUser, organizationId, appIds) };
}


export async function enforceSlugCheckRateLimit(
  clientIp: string | undefined
): Promise<SlugRateLimitResult> {
  if (!clientIp) {
    return { allowed: true };
  }
  const rules: RateLimitRule[] = [
    {
      key: `ratelimit:check-slug:ip:${clientIp}`,
      max: RATE_LIMITS.MAX_SLUG_CHECKS_PER_MINUTE_IP,
      windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
    },
  ];
  const result = await checkRateLimit(rules);
  if (result.allowed) {
    return { allowed: true };
  }
  return { allowed: false, retryAfter: result.retryAfter };
}

export async function findOrganizationIdBySlug(slug: string): Promise<string | null> {
  const existingOrganization = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true },
  });
  return existingOrganization?.id ?? null;
}

export async function isSlugOwnedByCaller(input: {
  readonly organizationId: string | null;
  readonly userId?: string;
  readonly sessionOrganizationId?: string;
}): Promise<boolean> {
  if (!input.organizationId || !input.userId) {
    return false;
  }
  if (input.sessionOrganizationId === input.organizationId) {
    return true;
  }
  const membership = await prisma.userOrganization.findUnique({
    where: {
      userId_organizationId: { userId: input.userId, organizationId: input.organizationId },
    },
    select: { status: true },
  });
  return membership !== null;
}
