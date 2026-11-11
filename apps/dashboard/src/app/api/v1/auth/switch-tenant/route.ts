import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  signSessionToken,
  encodeSessionPayload,
  createSessionCookieOptions,
  ForbiddenError,
} from "@suite/auth";
import { resolvePostLoginRoute } from "@/lib/route-dispatcher";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { problemResponse, successResponse, zodProblemResponse } from "@/lib/api-response";
import { switchTenantSession } from "@/services/session-context.service";

const switchTenantSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
});

function isForbiddenError(error: unknown): boolean {
  if (error instanceof ForbiddenError) {
    return true;
  }
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if ("status" in error && error.status === 403) {
    return true;
  }
  return "statusCode" in error && error.statusCode === 403;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const sessionResult = await getAuthenticatedSession(request);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }
    const payload = sessionResult.session;

    const body = await request.json().catch(() => null);
    const parseResult = switchTenantSchema.safeParse(body);
    if (!parseResult.success) {
      return zodProblemResponse(parseResult.error, {
        detail: parseResult.error.issues[0]?.message || "Validation failed",
      });
    }

    const tenantContext = await switchTenantSession({
      userId: payload.userId,
      organizationId: parseResult.data.organizationId,
    });
    const redirectUrl = resolvePostLoginRoute({
      permissions: tenantContext.permissions,
      roleSlug: tenantContext.roleSlug,
      onboardingStatus: "COMPLETED",
    });

    const isEphemeral = payload.isEphemeral ?? false;
    const remainingSeconds = payload.expiresAt
      ? Math.max(0, Math.floor((payload.expiresAt - Date.now()) / 1000))
      : undefined;

    const tokenJwt = await signSessionToken(
      encodeSessionPayload({
        userId: payload.userId,
        email: payload.email,
        userName: payload.userName,
        organizationId: tenantContext.organizationId,
        organizationName: tenantContext.organizationName,
        activeBranchId: tenantContext.activeBranchId ?? undefined,
        activeBranchName: tenantContext.activeBranchName ?? undefined,
        role: tenantContext.role,
        permissions: tenantContext.permissions,
        themePreference: payload.themePreference,
        timestamp: Date.now(),
        expiresAt: payload.expiresAt,
        isEphemeral,
        tokenVersion: payload.tokenVersion,
        sessionTimeoutSeconds: payload.sessionTimeoutSeconds,
        onboardingStatus: "COMPLETED",
        currentOnboardingStep: null,
      })
    );

    const cookieOptions = createSessionCookieOptions(!isEphemeral, remainingSeconds);
    const response = successResponse({
      success: true,
      redirectUrl,
    });
    response.cookies.set({
      name: cookieOptions.name,
      value: tokenJwt,
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
      maxAge: cookieOptions.maxAge,
    });
    return response;
  } catch (error) {
    if (isForbiddenError(error)) {
      return problemResponse({
        status: 403,
        code: "FORBIDDEN",
        title: "Forbidden",
        detail: error instanceof Error ? error.message : "You do not have access to this organization.",
      });
    }
    console.error("Error switching workspace context:", error);
    return problemResponse({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      title: "Internal Server Error",
      detail: "An unexpected error occurred while switching workspaces.",
    });
  }
}