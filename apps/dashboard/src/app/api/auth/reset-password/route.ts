import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@suite/db";
import { isProduction } from "@/lib/env";
import {
  completePasswordReset,
  signSessionToken,
  encodeSessionPayload,
  createSessionCookieOptions,
  SESSION_COOKIE_NAME,
  recordSecurityAuditLog,
  getUserOnboardingState,
} from "@suite/auth";
import { AUDIT_EVENT_TYPES } from "@suite/core";

const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Verification token is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters long"),
    confirmPassword: z.string().min(8, "Confirm password is required"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));
    const parseResult = resetPasswordSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          type: "/errors/validation-failed",
          title: "Bad Request",
          status: 400,
          detail: parseResult.error.issues[0]?.message || "Invalid password reset parameters",
          code: "VALIDATION_FAILED",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const { token, newPassword } = parseResult.data;

    // Execute atomic reset and global session revocation
    const result = await completePasswordReset({
      token,
      newPassword,
      prisma,
    });

    if (!result.success) {
      if (result.reason === "EXPIRED_TOKEN") {
        return NextResponse.json(
          {
            type: "/errors/token-expired",
            title: "Password Reset Token Expired",
            status: 410,
            detail: "The password reset link has expired after 15 minutes. Please request a new one.",
            code: "TOKEN_EXPIRED",
          },
          { status: 410, headers: { "Content-Type": "application/problem+json" } }
        );
      }

      if (result.reason === "PASSWORD_COMPLEXITY_FAILED") {
        return NextResponse.json(
          {
            type: "/errors/validation-failed",
            title: "Password Complexity Failed",
            status: 400,
            detail: result.error || "Password does not meet complexity requirements.",
            code: "VALIDATION_FAILED",
          },
          { status: 400, headers: { "Content-Type": "application/problem+json" } }
        );
      }

      return NextResponse.json(
        {
          type: "/errors/invalid-token",
          title: "Invalid Reset Token",
          status: 400,
          detail: "The password reset link is invalid or has already been used.",
          code: "INVALID_TOKEN",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    // Resolve user's primary organization membership for session context
    const membership = await prisma.userOrganization.findFirst({
      where: { userId: result.userId, status: "ACTIVE" },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });

    const userRecord = await prisma.user.findUnique({
      where: { id: result.userId },
      select: { name: true, email: true, metadata: true },
    });

    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const userAgent = request.headers.get("user-agent");

    // Record security audit trail entry (SPEC-04 / OWASP ASVS 4.0.3 Non-Repudiation)
    await recordSecurityAuditLog({
      prisma,
      organizationId: membership?.organizationId,
      userId: result.userId,
      action: AUDIT_EVENT_TYPES.AUTH_PASSWORD_RESET,
      ipAddress: clientIp,
      userAgent,
      details: {
        email: result.email,
        sessionsRevoked: true,
      },
    });

    const onboardingState = getUserOnboardingState(userRecord?.metadata);

    // Issue fresh session token and cookie for current client
    const sessionToken = await signSessionToken(
      encodeSessionPayload({
        userId: result.userId,
        email: result.email,
        userName: userRecord?.name || result.email.split("@")[0] || "User",
        organizationId: membership?.organizationId,
        organizationName: membership?.organization.name,
        role: "owner",
        onboardingStatus: onboardingState.onboardingStatus,
        timestamp: Date.now(),
      })
    );

    const response = NextResponse.json({
      success: true,
      message: "Password updated successfully. All previous sessions have been revoked.",
      redirectUrl: "/dashboard",
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
