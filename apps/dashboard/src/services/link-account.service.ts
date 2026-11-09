import { checkRateLimit, type RateLimitRule } from "@suite/redis";
import { prisma } from "@suite/db";
import {
  extractEffectivePermissions,
  getBetterAuthSecret,
  linkOAuthAccountWithPassword,
  recordSecurityAuditLog,
  type OnboardingStatus,
  type ThemePreference,
} from "@suite/auth";
import { AUDIT_EVENT_TYPES, RATE_LIMITS } from "@suite/core";
import { mapIdentity, mapOnboarding, mapOrganization } from "./session-mapper";

export interface AccountLinkContext {
  readonly userId: string;
  readonly email: string;
  readonly userName: string;
  readonly organizationId?: string;
  readonly organizationName?: string;
  readonly roleName: string;
  readonly permissions: string[];
  readonly onboardingStatus: OnboardingStatus;
  readonly currentOnboardingStep?: number;
  readonly themePreference: ThemePreference;
}

export type LinkAccountResult =
  | { readonly status: "rate_limited"; readonly detail?: string; readonly retryAfter: number }
  | { readonly status: "invalid_ticket" }
  | { readonly status: "invalid_password" }
  | { readonly status: "account_not_found" }
  | { readonly status: "user_not_found" }
  | { readonly status: "linked"; readonly context: AccountLinkContext };

function buildLinkAttemptRules(ticket: string, clientIp?: string): RateLimitRule[] {
  const rules: RateLimitRule[] = [];
  if (clientIp) {
    rules.push({
      key: `ratelimit:link-account:ip:${clientIp}`,
      max: RATE_LIMITS.MAX_LINK_ATTEMPTS_PER_WINDOW_IP,
      windowSeconds: RATE_LIMITS.WINDOW_15_MIN_SECONDS,
    });
  }
  rules.push({
    key: `ratelimit:link-account:ticket:${ticket.slice(-32)}`,
    max: RATE_LIMITS.MAX_LINK_ATTEMPTS_PER_WINDOW_TICKET,
    windowSeconds: RATE_LIMITS.WINDOW_15_MIN_SECONDS,
  });
  return rules;
}

function loadLinkedUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      organizations: {
        where: { status: "ACTIVE" },
        include: { organization: true },
        orderBy: { createdAt: "asc" },
      },
      branchRoles: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
          branch: true,
        },
      },
    },
  });
}

type LinkedUser = NonNullable<Awaited<ReturnType<typeof loadLinkedUser>>>;

function buildLinkContext(dbUser: LinkedUser): AccountLinkContext {
  const onboarding = mapOnboarding(dbUser.metadata);
  const branchRole = dbUser.branchRoles[0];
  const fallbackRole = onboarding.onboardingStatus === "IN_PROGRESS" ? "owner" : "member";

  return {
    ...mapIdentity(dbUser),
    ...mapOrganization(dbUser.organizations),
    ...onboarding,
    roleName: branchRole?.role.name ?? fallbackRole,
    permissions: extractEffectivePermissions(dbUser.branchRoles),
  };
}

async function recordAccountLinkedAudit(input: {
  readonly userId: string;
  readonly organizationId?: string;
  readonly providerId: string;
  readonly accountId: string;
  readonly clientIp?: string;
  readonly userAgent?: string | null;
}): Promise<void> {
  await recordSecurityAuditLog({
    prisma,
    organizationId: input.organizationId,
    userId: input.userId,
    action: AUDIT_EVENT_TYPES.AUTH_ACCOUNT_LINKED,
    ipAddress: input.clientIp,
    userAgent: input.userAgent ?? undefined,
    details: {
      providerId: input.providerId,
      accountId: input.accountId,
      linkedAt: new Date().toISOString(),
    },
  });
}

function mapLinkFailure(reason: string): LinkAccountResult {
  if (reason === "INVALID_TICKET" || reason === "EXPIRED_TICKET") {
    return { status: "invalid_ticket" };
  }
  if (reason === "INVALID_PASSWORD") {
    return { status: "invalid_password" };
  }
  return { status: "account_not_found" };
}

export async function linkAccountWithPassword(input: {
  readonly ticket: string;
  readonly password: string;
  readonly clientIp?: string;
  readonly userAgent?: string | null;
}): Promise<LinkAccountResult> {
  const rateLimit = await checkRateLimit(buildLinkAttemptRules(input.ticket, input.clientIp));
  if (!rateLimit.allowed) {
    return {
      status: "rate_limited",
      detail: rateLimit.detail,
      retryAfter: rateLimit.retryAfter,
    };
  }

  const result = await linkOAuthAccountWithPassword({
    ticket: input.ticket,
    password: input.password,
    prisma,
    secretKey: getBetterAuthSecret(),
  });
  if (!result.success) {
    return mapLinkFailure(result.reason);
  }

  const dbUser = await loadLinkedUser(result.userId);
  if (!dbUser) {
    return { status: "user_not_found" };
  }

  const context = buildLinkContext(dbUser);
  await recordAccountLinkedAudit({
    userId: dbUser.id,
    organizationId: context.organizationId,
    providerId: result.providerId,
    accountId: result.accountId,
    clientIp: input.clientIp,
    userAgent: input.userAgent,
  });
  return { status: "linked", context };
}
