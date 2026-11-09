import { checkRateLimit, enqueueEmail, type RateLimitRule } from "@suite/redis";
import { prisma } from "@suite/db";
import {
  completePasswordReset,
  createPasswordResetToken,
  extractEffectivePermissions,
  recordSecurityAuditLog,
  sendEmail,
  type OnboardingStatus,
  type ThemePreference,
} from "@suite/auth";
import { AUDIT_EVENT_TYPES, RATE_LIMITS } from "@suite/core";
import { mapBranch, mapIdentity, mapOnboarding, mapOrganization } from "./session-mapper";

export interface RateLimitRejection {
  readonly status: "rate_limited";
  readonly detail?: string;
  readonly retryAfter: number;
}

export type RequestPasswordResetResult = { readonly status: "dispatched" } | RateLimitRejection;

export interface ResetPasswordSessionContext {
  readonly userId: string;
  readonly email: string;
  readonly userName: string;
  readonly organizationId?: string;
  readonly organizationName?: string;
  readonly roleName?: string;
  readonly activeBranchId?: string;
  readonly activeBranchName?: string;
  readonly permissions: string[];
  readonly onboardingStatus: OnboardingStatus;
  readonly currentOnboardingStep?: number;
  readonly themePreference: ThemePreference;
  readonly hasMultipleWorkspaces: boolean;
}

export type ResetPasswordResult =
  | RateLimitRejection
  | { readonly status: "expired_token" }
  | { readonly status: "complexity_failed"; readonly detail: string }
  | { readonly status: "invalid_token" }
  | { readonly status: "reset"; readonly context: ResetPasswordSessionContext };

interface ResetRequestInput {
  readonly email: string;
  readonly clientIp?: string;
  readonly origin: string;
}

function buildRequestRules(email: string, clientIp?: string): RateLimitRule[] {
  const rules: RateLimitRule[] = [];
  if (clientIp) {
    rules.push({
      key: `ratelimit:forgot-password:ip:${clientIp}`,
      max: RATE_LIMITS.MAX_PASSWORD_RESET_PER_HOUR_IP,
      windowSeconds: RATE_LIMITS.WINDOW_1_HOUR_SECONDS,
    });
  }
  rules.push({
    key: `ratelimit:forgot-password:${email}`,
    max: RATE_LIMITS.MAX_PASSWORD_RESET_PER_HOUR_EMAIL,
    windowSeconds: RATE_LIMITS.WINDOW_1_HOUR_SECONDS,
  });
  return rules;
}

function buildResetEmail(email: string, rawToken: string, origin: string) {
  const resetUrl = origin + "/reset-password?token=" + rawToken;
  return {
    to: email,
    subject: "Reset your password - Business OS",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1E1B19;">Reset your password</h2>
        <p style="color: #5C504B; font-size: 15px; line-height: 1.5;">
          We received a request to reset the password for your Business OS account. Click the button below to choose a new password.
        </p>
        <div style="margin: 32px 0;">
          <a href="${resetUrl}" style="background-color: #0F766E; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #8C7B75; font-size: 13px;">
          This link is valid for 15 minutes and can only be used once. If you did not request a password reset, you can safely ignore this email.
        </p>
      </div>
    `,
    text: "Reset your Business OS password by visiting: " + resetUrl,
  };
}

async function dispatchResetEmail(email: string, rawToken: string, origin: string): Promise<void> {
  const payload = buildResetEmail(email, rawToken, origin);
  try {
    await enqueueEmail(payload);
  } catch {
    await sendEmail(payload);
  }
}

export async function requestPasswordReset(
  input: ResetRequestInput
): Promise<RequestPasswordResetResult> {
  const rateLimit = await checkRateLimit(buildRequestRules(input.email, input.clientIp));
  if (!rateLimit.allowed) {
    return {
      status: "rate_limited",
      detail: rateLimit.detail,
      retryAfter: rateLimit.retryAfter,
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true },
  });
  if (!user) {
    return { status: "dispatched" };
  }

  const { rawToken } = await createPasswordResetToken(input.email, prisma);
  await dispatchResetEmail(input.email, rawToken, input.origin);
  return { status: "dispatched" };
}

function buildResetAttemptRules(token: string, clientIp?: string): RateLimitRule[] {
  const rules: RateLimitRule[] = [];
  if (clientIp) {
    rules.push({
      key: `ratelimit:reset-password:ip:${clientIp}`,
      max: RATE_LIMITS.MAX_RESET_ATTEMPTS_PER_WINDOW_IP,
      windowSeconds: RATE_LIMITS.WINDOW_15_MIN_SECONDS,
    });
  }
  rules.push({
    key: `ratelimit:reset-password:token:${token.slice(-32)}`,
    max: RATE_LIMITS.MAX_RESET_ATTEMPTS_PER_WINDOW_TOKEN,
    windowSeconds: RATE_LIMITS.WINDOW_15_MIN_SECONDS,
  });
  return rules;
}

function mapResetFailure(result: {
  readonly reason: string;
  readonly error?: string;
}): ResetPasswordResult {
  if (result.reason === "EXPIRED_TOKEN") {
    return { status: "expired_token" };
  }
  if (result.reason === "PASSWORD_COMPLEXITY_FAILED") {
    return {
      status: "complexity_failed",
      detail: result.error ?? "Password does not meet complexity requirements.",
    };
  }
  return { status: "invalid_token" };
}

type ResetUser = Awaited<ReturnType<typeof loadResetUser>>;

function loadResetUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      metadata: true,
      organizations: {
        where: { status: "ACTIVE" },
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

function buildFallbackResetContext(fallback: {
  readonly userId: string;
  readonly email: string;
}): ResetPasswordSessionContext {
  return {
    userId: fallback.userId,
    email: fallback.email,
    userName: fallback.email.split("@")[0] ?? "User",
    permissions: [],
    onboardingStatus: "IN_PROGRESS",
    themePreference: "system",
    hasMultipleWorkspaces: false,
  };
}

function buildResetContext(
  user: ResetUser,
  fallback: { readonly userId: string; readonly email: string }
): ResetPasswordSessionContext {
  if (!user) {
    return buildFallbackResetContext(fallback);
  }

  const onboarding = mapOnboarding(user.metadata);
  const branch = mapBranch(user.branchRoles[0]);
  return {
    ...mapIdentity(user),
    ...mapOrganization(user.organizations),
    ...branch,
    ...onboarding,
    roleName: user.branchRoles[0]?.role.name,
    permissions: extractEffectivePermissions(user.branchRoles, {
      branchId: branch.activeBranchId,
    }),
    hasMultipleWorkspaces:
      onboarding.onboardingStatus === "COMPLETED" && user.organizations.length > 1,
  };
}

async function recordResetAudit(context: ResetPasswordSessionContext, audit: {
  readonly clientIp?: string;
  readonly userAgent?: string | null;
}): Promise<void> {
  await recordSecurityAuditLog({
    prisma,
    organizationId: context.organizationId,
    userId: context.userId,
    action: AUDIT_EVENT_TYPES.AUTH_PASSWORD_RESET,
    ipAddress: audit.clientIp,
    userAgent: audit.userAgent ?? undefined,
    details: { email: context.email, sessionsRevoked: true },
  });
}

export async function resetPasswordWithToken(input: {
  readonly token: string;
  readonly newPassword: string;
  readonly clientIp?: string;
  readonly userAgent?: string | null;
}): Promise<ResetPasswordResult> {
  const rateLimit = await checkRateLimit(buildResetAttemptRules(input.token, input.clientIp));
  if (!rateLimit.allowed) {
    return {
      status: "rate_limited",
      detail: rateLimit.detail,
      retryAfter: rateLimit.retryAfter,
    };
  }

  const result = await completePasswordReset({
    token: input.token,
    newPassword: input.newPassword,
    prisma,
  });

  if (!result.success) {
    return mapResetFailure(result);
  }

  const context = buildResetContext(await loadResetUser(result.userId), {
    userId: result.userId,
    email: result.email,
  });
  await recordResetAudit(context, input);
  return { status: "reset", context };
}
