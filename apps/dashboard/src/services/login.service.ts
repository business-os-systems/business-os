import { prisma, type Prisma } from "@suite/db";
import { verifyPassword } from "@suite/auth/password";
import {
  extractEffectivePermissions,
  getUserOnboardingState,
  recordSecurityAuditLog,
  type OnboardingStatus,
  type ThemePreference,
} from "@suite/auth";
import {
  AUDIT_EVENT_TYPES,
  TENANT_STATUS,
  isBlockingTenantStatus,
} from "@suite/core";

const CREDENTIAL_PROVIDER_ID = "credential";

export interface LoginSessionContext {
  readonly userId: string;
  readonly email: string;
  readonly userName: string;
  readonly roleName?: string;
  readonly roleSlug?: string;
  readonly permissions: string[];
  readonly organizationId?: string;
  readonly organizationName?: string;
  readonly activeBranchId?: string;
  readonly activeBranchName?: string;
  readonly onboardingStatus: OnboardingStatus;
  readonly currentOnboardingStep?: number;
  readonly themePreference: ThemePreference;
  readonly hasMultipleWorkspaces: boolean;
}

export type PasswordLoginResult =
  | { readonly status: "invalid_credentials" }
  | { readonly status: "workspace_access_denied" }
  | { readonly status: "workspace_suspended" }
  | { readonly status: "workspace_archived" }
  | { readonly status: "authenticated"; readonly context: LoginSessionContext };

export interface LoginAuditInput {
  readonly userId: string;
  readonly organizationId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string | null;
}

type LoginUser = Prisma.UserGetPayload<{
  include: {
    accounts: true;
    organizations: { include: { organization: true } };
    branchRoles: {
      include: {
        role: { include: { permissions: { include: { permission: true } } } };
        branch: true;
      };
    };
  };
}>;

function findLoginUser(email: string): Promise<LoginUser | null> {
  return prisma.user.findUnique({
    where: { email },
    include: {
      accounts: true,
      organizations: {
        orderBy: { createdAt: "asc" },
        include: { organization: true },
      },
      branchRoles: {
        orderBy: { createdAt: "asc" },
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
          branch: true,
        },
      },
    },
  });
}

async function auditRejectedWorkspace(
  input: LoginAuditInput & { readonly reason: string }
): Promise<void> {
  await recordSecurityAuditLog({
    prisma,
    organizationId: input.organizationId,
    userId: input.userId,
    action: AUDIT_EVENT_TYPES.AUTH_LOGIN_REJECTED,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent ?? undefined,
    metadata: { method: "password", reason: input.reason },
  });
}

function pickMembership(dbUser: LoginUser) {
  // Falling back to the oldest membership keeps the session shape stable; the
  // lifecycle refusal below then rejects a sign-in with no usable workspace.
  const usable = dbUser.organizations.find(
    (candidate) => !isBlockingTenantStatus(candidate.organization.status)
  );
  return usable ?? dbUser.organizations[0];
}

interface ContextInput {
  readonly dbUser: LoginUser;
  readonly organizationId?: string;
  readonly organizationName?: string;
  readonly branchRole: LoginUser["branchRoles"][number] | undefined;
}

function buildLoginContext(input: ContextInput): LoginSessionContext {
  const { dbUser, organizationId, organizationName, branchRole } = input;
  const onboarding = getUserOnboardingState(dbUser.metadata);
  const branchId = branchRole?.branchId ?? undefined;
  const permissions = extractEffectivePermissions(dbUser.branchRoles, { branchId });

  return {
    userId: dbUser.id,
    email: dbUser.email,
    userName: dbUser.name,
    roleName: branchRole?.role.name,
    roleSlug: branchRole?.role.slug,
    permissions,
    organizationId,
    organizationName,
    activeBranchId: branchId,
    activeBranchName: branchRole?.branch?.name ?? undefined,
    onboardingStatus: onboarding.onboardingStatus,
    currentOnboardingStep: onboarding.currentOnboardingStep ?? undefined,
    themePreference: onboarding.themePreference,
    hasMultipleWorkspaces:
      onboarding.onboardingStatus === "COMPLETED" && dbUser.organizations.length > 1,
  };
}

async function resolveWorkspaceAccess(
  dbUser: LoginUser,
  audit: LoginAuditInput
): Promise<PasswordLoginResult> {
  const membership = pickMembership(dbUser);
  const organization = membership?.organization;
  const onboardingStatus = getUserOnboardingState(dbUser.metadata).onboardingStatus;

  if (onboardingStatus !== "IN_PROGRESS" && !organization) {
    return { status: "workspace_access_denied" };
  }

  if (organization?.status === TENANT_STATUS.SUSPENDED) {
    await auditRejectedWorkspace({
      ...audit,
      organizationId: organization.id,
      reason: "WORKSPACE_SUSPENDED",
    });
    return { status: "workspace_suspended" };
  }

  if (organization?.status === TENANT_STATUS.ARCHIVED) {
    await auditRejectedWorkspace({
      ...audit,
      organizationId: organization.id,
      reason: "WORKSPACE_ARCHIVED",
    });
    return { status: "workspace_archived" };
  }

  return {
    status: "authenticated",
    context: buildLoginContext({
      dbUser,
      organizationId: organization?.id,
      organizationName: organization?.name,
      branchRole: dbUser.branchRoles[0],
    }),
  };
}

export async function authenticateWithPassword(input: {
  readonly email: string;
  readonly password: string;
  readonly ipAddress?: string;
  readonly userAgent?: string | null;
}): Promise<PasswordLoginResult> {
  const dbUser = await findLoginUser(input.email);
  if (!dbUser) {
    return { status: "invalid_credentials" };
  }

  const credentialAccount = dbUser.accounts.find(
    (account) => account.providerId === CREDENTIAL_PROVIDER_ID
  );
  if (!credentialAccount?.password) {
    return { status: "invalid_credentials" };
  }

  const isPasswordValid = await verifyPassword(input.password, credentialAccount.password);
  if (!isPasswordValid) {
    return { status: "invalid_credentials" };
  }

  return resolveWorkspaceAccess(dbUser, {
    userId: dbUser.id,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
}

export async function recordSuccessfulLogin(input: LoginAuditInput): Promise<void> {
  await recordSecurityAuditLog({
    prisma,
    organizationId: input.organizationId,
    userId: input.userId,
    action: AUDIT_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent ?? undefined,
    metadata: { method: "password" },
  });
}
