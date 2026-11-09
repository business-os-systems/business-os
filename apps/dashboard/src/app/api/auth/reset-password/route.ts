import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE_NAME,
  createSessionCookieOptions,
  signSessionToken,
  encodeSessionPayload,
} from "@/lib/auth-constants";
import { isProduction } from "@/lib/env";
import { resolvePostLoginRoute } from "@/lib/route-dispatcher";
import { problemResponse, zodProblemResponse } from "@/lib/problem-response";
import { resetPasswordWithToken, type ResetPasswordResult } from "@/services/password-reset.service";

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

function mapResetProblem(result: ResetPasswordResult): NextResponse {
  switch (result.status) {
    case "rate_limited":
      return problemResponse({
        status: 429,
        code: "RATE_LIMIT_EXCEEDED",
        title: "Too Many Requests",
        detail:
          result.detail ||
          "Too many attempts on this password reset token. Please request a new reset link.",
        retryAfter: result.retryAfter,
      });
    case "expired_token":
      return problemResponse({
        status: 410,
        code: "TOKEN_EXPIRED",
        title: "Password Reset Token Expired",
        detail: "The password reset link has expired after 15 minutes. Please request a new one.",
      });
    case "complexity_failed":
      return problemResponse({
        status: 400,
        code: "VALIDATION_FAILED",
        title: "Password Complexity Failed",
        detail: result.detail,
      });
    case "invalid_token":
      return problemResponse({
        status: 400,
        code: "INVALID_TOKEN",
        title: "Invalid Reset Token",
        detail: "The password reset link is invalid or has already been used.",
      });
    case "reset":
      return problemResponse({
        status: 500,
        code: "INTERNAL_SERVER_ERROR",
        title: "Internal Server Error",
        detail: "Unexpected reset outcome.",
      });
  }
}

async function buildResetResponse(result: ResetPasswordResult): Promise<NextResponse> {
  if (result.status !== "reset") {
    return mapResetProblem(result);
  }
  const context = result.context;
  const redirectUrl = context.hasMultipleWorkspaces
    ? "/choose-tenant"
    : resolvePostLoginRoute({
        permissions: context.permissions,
        onboardingStatus: context.onboardingStatus,
        currentOnboardingStep: context.currentOnboardingStep,
      });

  const sessionToken = await signSessionToken(
    encodeSessionPayload({
      userId: context.userId,
      email: context.email,
      userName: context.userName,
      organizationId: context.organizationId,
      organizationName: context.organizationName,
      role: context.roleName,
      permissions: context.permissions,
      activeBranchId: context.activeBranchId,
      activeBranchName: context.activeBranchName,
      themePreference: context.themePreference,
      onboardingStatus: context.onboardingStatus,
      currentOnboardingStep: context.currentOnboardingStep,
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
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));
    const parseResult = resetPasswordSchema.safeParse(body);
    if (!parseResult.success) {
      return zodProblemResponse(parseResult.error, {
        detail: parseResult.error.issues[0]?.message || "Invalid password reset parameters",
      });
    }

    const { token, newPassword } = parseResult.data;
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const result = await resetPasswordWithToken({
      token,
      newPassword,
      clientIp,
      userAgent: request.headers.get("user-agent"),
    });
    return await buildResetResponse(result);
  } catch (error) {
    console.error("Error executing password reset:", error);
    return problemResponse({
      type: "/errors/internal-error",
      title: "Internal Server Error",
      status: 500,
      detail: "An unexpected error occurred while resetting password.",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}
