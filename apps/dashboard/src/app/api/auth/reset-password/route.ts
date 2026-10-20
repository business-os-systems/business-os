import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@suite/db";
import { checkRateLimit } from "@suite/redis";
import { isProduction } from "@/lib/env";
import { resolvePostLoginRoute } from "@/lib/route-dispatcher";
import { problemResponse } from "@/lib/problem-response";
import {
  completePasswordReset,
  signSessionToken,
  encodeSessionPayload,
  createSessionCookieOptions,
  SESSION_COOKIE_NAME,
  recordSecurityAuditLog,
  getUserOnboardingState,
  extractEffectivePermissions,
} from "@suite/auth";
import { AUDIT_EVENT_TYPES } from "@suite/core";

const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Verification token is required"),
    newPassword: z.string().min(12, "Password must be at least 12 characters long"),
    confirmPassword: z.string().min(12, "Confirm password is required"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const MAX_RESET_ATTEMPTS_PER_WINDOW_TOKEN = 5;
const MAX_RESET_ATTEMPTS_PER_WINDOW_IP = 20;
const RATE_LIMIT_WINDOW_SECONDS = 900; // 15 minutes

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));
    const parseResult = resetPasswordSchema.safeParse(body);

    if (!parseResult.success) {
      return problemResponse({
        status: 400,
        code: "VALIDATION_FAILED",
        title: "Bad Request",
        detail: parseResult.error.issues[0]?.message || "Invalid password reset parameters",
      });
    }

    const { token, newPassword } = parseResult.data;

    // Dual-tier brute-force rate limiting via @suite/redis (Tier 1: IP, Tier 2: Reset Token)
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rateLimit = await checkRateLimit([
      ...(clientIp !== "unknown"
        ? [{ key: `ratelimit:reset-password:ip:${clientIp}`, max: MAX_RESET_ATTEMPTS_PER_WINDOW_IP, windowSeconds: RATE_LIMIT_WINDOW_SECONDS }]
        : []),
      { key: `ratelimit:reset-password:token:${token.slice(-32)}`, max: MAX_RESET_ATTEMPTS_PER_WINDOW_TOKEN, windowSeconds: RATE_LIMIT_WINDOW_SECONDS },
    ]);

    if (!rateLimit.allowed) {
      return problemResponse({
        status: 429,
        code: "RATE_LIMIT_EXCEEDED",
        title: "Too Many Requests",
        detail: rateLimit.detail || "Too many attempts on this password reset token. Please request a new reset link.",
        retryAfter: rateLimit.retryAfter,
      });
    }

    // Execute atomic reset and global session revocation
    const result = await completePasswordReset({
      token,
      newPassword,
      prisma,
    });

    if (!result.success) {
      if (result.reason === "EXPIRED_TOKEN") {
        return problemResponse({
          status: 410,
          code: "TOKEN_EXPIRED",
          title: "Password Reset Token Expired",
          detail: "The password reset link has expired after 15 minutes. Please request a new one.",
        });
      }

      if (result.reason === "PASSWORD_COMPLEXITY_FAILED") {
        return problemResponse({
          status: 400,
          code: "VALIDATION_FAILED",
          title: "Password Complexity Failed",
          detail: result.error || "Password does not meet complexity requirements.",
        });
      }

      return problemResponse({
        status: 400,
        code: "INVALID_TOKEN",
        title: "Invalid Reset Token",
        detail: "The password reset link is invalid or has already been used.",
      });
    }

    // Resolve user's primary organization membership and branch roles for dynamic capability session context
    const dbUser = await prisma.user.findUnique({
      where: { id: result.userId },
      select: {
        id: true,
        name: true,
        email: true,
        metadata: true,
        organizations: {
          where: { status: "ACTIVE" },
          orderBy: { createdAt: "asc" },
          include: {
            organization: true,
          },
        },
        branchRoles: {
          orderBy: { createdAt: "asc" },
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
            branch: true,
          },
        },
      },
    });

    const membership = dbUser?.organizations[0];
    const organization = membership?.organization;
    const branchRole = dbUser?.branchRoles[0];
    const roleName = branchRole?.role?.name;
    const branchName = branchRole?.branch?.name ?? undefined;
    const branchId = branchRole?.branchId ?? undefined;

    const userPermissions = dbUser?.branchRoles
      ? extractEffectivePermissions(dbUser.branchRoles, { branchId })
      : [];

    const onboardingState = getUserOnboardingState(dbUser?.metadata);
    const onboardingStatus = onboardingState.onboardingStatus;
    const currentOnboardingStep = onboardingState.currentOnboardingStep ?? undefined;
    const themePreference = onboardingState.themePreference;

    const hasMultipleWorkspaces =
      onboardingStatus === "COMPLETED" && (dbUser?.organizations.length ?? 0) > 1;

    const redirectUrl = hasMultipleWorkspaces
      ? "/choose-tenant"
      : resolvePostLoginRoute({
          permissions: userPermissions,
          onboardingStatus,
          currentOnboardingStep,
        });

    const userAgent = request.headers.get("user-agent");

    // Record security audit trail entry (SPEC-04 / OWASP ASVS 4.0.3 Non-Repudiation)
    await recordSecurityAuditLog({
      prisma,
      organizationId: organization?.id,
      userId: result.userId,
      action: AUDIT_EVENT_TYPES.AUTH_PASSWORD_RESET,
      ipAddress: clientIp !== "unknown" ? clientIp : undefined,
      userAgent,
      details: {
        email: result.email,
        sessionsRevoked: true,
      },
    });

    // Issue fresh session token and cookie for current client with preserved permissions
    const sessionToken = await signSessionToken(
      encodeSessionPayload({
        userId: result.userId,
        email: result.email,
        userName: dbUser?.name || result.email.split("@")[0] || "User",
        organizationId: organization?.id,
        organizationName: organization?.name,
        role: roleName,
        permissions: userPermissions,
        activeBranchId: branchId,
        activeBranchName: branchName,
        themePreference,
        onboardingStatus,
        currentOnboardingStep,
        timestamp: Date.now(),
      })
    );

    const response = NextResponse.json({
      success: true,
      message: "Password updated successfully. All previous sessions have been revoked.",
      redirectUrl,
    });

    const cookieOptions = createSessionCookieOptions(isProduction, false);
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionToken,
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
      maxAge: cookieOptions.maxAge,
    });
    return response;
  } catch (error) {
    console.error("Error executing password reset:", error);
    return NextResponse.json(
      {
        type: "/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: "An unexpected error occurred while resetting password.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
