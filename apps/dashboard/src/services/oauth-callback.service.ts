import { prisma } from "@suite/db";
import {
  createAccountLinkingTicket,
  extractEffectivePermissions,
  getBetterAuthSecret,
  recordSecurityAuditLog,
  type OAuthExchangeResult,
  type OnboardingStatus,
  type ThemePreference,
} from "@suite/auth";
import { AUDIT_EVENT_TYPES } from "@suite/core";
import { mapBranch, mapIdentity, mapOnboarding, mapOrganization } from "./session-mapper";

export interface OAuthLoginContext {
  readonly userId: string;
  readonly email: string;
  readonly userName: string;
  readonly roleName: string;
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

export type ResolveOAuthLoginResult =
  | { readonly status: "account_collision"; readonly ticket: string }
  | {
      readonly status: "authenticated";
      readonly context: OAuthLoginContext;
      readonly organizationId?: string;
    };

interface OAuthRoleView {
  readonly name?: string;
  readonly permissions?: {
    readonly permission?: { readonly action?: string | null } | null;
  }[];
}

interface OAuthBranchRoleView {
  readonly branchId?: string | null;
  readonly branch?: { readonly name: string } | null;
  readonly role?: OAuthRoleView | null;
}

interface OAuthUserView {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly metadata: unknown;
  readonly organizations: readonly {
    readonly organization: { readonly id: string; readonly name: string };
  }[];
  readonly branchRoles: readonly OAuthBranchRoleView[];
}

const LOGIN_METHOD_PREFIX = "oauth_";

export interface OAuthAuditInput {
  readonly userId: string;
  readonly organizationId?: string;
  readonly provider: string;
  readonly clientIp?: string;
  readonly userAgent?: string | null;
}

function buildContext(
  user: OAuthUserView,
  organizationList: OAuthUserView["organizations"],
  branchRoles: readonly OAuthBranchRoleView[]
): OAuthLoginContext {
  const onboarding = mapOnboarding(user.metadata);
  const branch = mapBranch(branchRoles[0]);

  return {
    ...mapIdentity(user),
    ...mapOrganization(organizationList),
    ...branch,
    ...onboarding,
    themePreference: "system",
    roleName: branchRoles[0]?.role?.name ?? "Member",
    permissions: extractEffectivePermissions(branchRoles, { branchId: branch.activeBranchId }),
    hasMultipleWorkspaces:
      onboarding.onboardingStatus === "COMPLETED" && organizationList.length > 1,
  };
}

function buildAccountTokenUpdate(exchange: OAuthExchangeResult, existing: {
  readonly refreshToken: string | null;
  readonly idToken: string | null;
  readonly scope: string | null;
  readonly accessTokenExpiresAt: Date | null;
}) {
  return {
    accessToken: exchange.tokens.accessToken,
    refreshToken: exchange.tokens.refreshToken ?? existing.refreshToken,
    idToken: exchange.tokens.idToken ?? existing.idToken,
    scope: exchange.tokens.scope ?? existing.scope,
    accessTokenExpiresAt: exchange.tokens.expiresIn
      ? new Date(Date.now() + exchange.tokens.expiresIn * 1000)
      : existing.accessTokenExpiresAt,
  };
}

function buildLinkingTicket(exchange: OAuthExchangeResult): string {
  return createAccountLinkingTicket({
    email: exchange.profile.email.toLowerCase().trim(),
    providerId: exchange.provider,
    accountId: exchange.profile.id,
    name: exchange.profile.name,
    image: exchange.profile.image ?? undefined,
    secretKey: getBetterAuthSecret(),
  });
}

async function resolveExistingAccount(
  exchange: OAuthExchangeResult
): Promise<OAuthUserView | null> {
  const existingAccount = await prisma.account.findUnique({
    where: {
      providerId_accountId: {
        providerId: exchange.provider,
        accountId: exchange.profile.id,
      },
    },
    include: {
      user: {
        include: {
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
      },
    },
  });

  if (!existingAccount) {
    return null;
  }

  await prisma.account.update({
    where: { id: existingAccount.id },
    data: buildAccountTokenUpdate(exchange, existingAccount),
  });

  return existingAccount.user;
}

function resolveDisplayName(name: string, email: string): string {
  const trimmedName = name.trim();
  if (trimmedName) {
    return trimmedName;
  }
  return email.split("@")[0] ?? "User";
}

async function createOAuthAccount(exchange: OAuthExchangeResult): Promise<OAuthUserView> {
  const normalizedEmail = exchange.profile.email.toLowerCase().trim();

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: normalizedEmail,
        name: resolveDisplayName(exchange.profile.name, normalizedEmail),
        image: exchange.profile.image ?? null,
        emailVerified: exchange.profile.emailVerified,
        metadata: {
          onboarding_status: "IN_PROGRESS",
          current_onboarding_step: 1,
        },
      },
    });

    await tx.account.create({
      data: {
        userId: user.id,
        providerId: exchange.provider,
        accountId: exchange.profile.id,
        accessToken: exchange.tokens.accessToken,
        refreshToken: exchange.tokens.refreshToken,
        idToken: exchange.tokens.idToken,
        scope: exchange.tokens.scope,
        accessTokenExpiresAt: exchange.tokens.expiresIn
          ? new Date(Date.now() + exchange.tokens.expiresIn * 1000)
          : undefined,
      },
    });

    return { ...user, organizations: [], branchRoles: [] };
  });
}

export async function resolveOAuthLogin(
  exchange: OAuthExchangeResult
): Promise<ResolveOAuthLoginResult> {
  const existingAccountUser = await resolveExistingAccount(exchange);
  if (existingAccountUser) {
    return {
      status: "authenticated",
      context: buildContext(
        existingAccountUser,
        existingAccountUser.organizations,
        existingAccountUser.branchRoles
      ),
    };
  }

  const normalizedEmail = exchange.profile.email.toLowerCase().trim();
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { accounts: true },
  });
  if (existingUser) {
    return { status: "account_collision", ticket: buildLinkingTicket(exchange) };
  }

  const user = await createOAuthAccount(exchange);
  return {
    status: "authenticated",
    context: buildContext(user, [], []),
  };
}

export async function recordOAuthLoginAudit(input: OAuthAuditInput): Promise<void> {
  await recordSecurityAuditLog({
    prisma,
    organizationId: input.organizationId,
    userId: input.userId,
    action: AUDIT_EVENT_TYPES.AUTH_LOGIN_SUCCESS,
    ipAddress: input.clientIp,
    userAgent: input.userAgent ?? undefined,
    metadata: { method: LOGIN_METHOD_PREFIX + input.provider },
  });
}
