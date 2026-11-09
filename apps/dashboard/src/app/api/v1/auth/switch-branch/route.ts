import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  signSessionToken,
  encodeSessionPayload,
  createSessionCookieOptions,
  SESSION_COOKIE_NAME,
  ForbiddenError,
} from "@suite/auth";
import { isProduction } from "@/lib/env";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { problemResponse, successResponse, zodProblemResponse } from "@/lib/api-response";
import { switchBranchSession } from "@/services/session-context.service";

const switchBranchSchema = z.object({
  branchId: z.string().min(1, "Branch ID is required"),
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
    const sessionResult = await getAuthenticatedSession(request, {
      requireOrganization: true,
    });
    if (!sessionResult.ok) {
      return sessionResult.response;
    }
    const payload = sessionResult.session;

    const body = await request.json().catch(() => null);
    const parseResult = switchBranchSchema.safeParse(body);
    if (!parseResult.success) {
      return zodProblemResponse(parseResult.error, {
        detail: parseResult.error.issues[0]?.message || "Validation failed",
      });
    }

    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value || "";
    const branchContext = await switchBranchSession({
      sessionToken: sessionCookie,
      branchId: parseResult.data.branchId,
    });

    const isEphemeral = payload.isEphemeral ?? false;
    const remainingSeconds = payload.expiresAt
      ? Math.max(0, Math.floor((payload.expiresAt - Date.now()) / 1000))
      : undefined;

    const tokenJwt = await signSessionToken(
      encodeSessionPayload({
        ...payload,
        organizationId: branchContext.activeOrganizationId,
        activeBranchId: branchContext.activeBranchId,
        activeBranchName: branchContext.branch.name,
        permissions: branchContext.permissions,
        role: branchContext.effectiveRoles[0] ?? payload.role,
        timestamp: Date.now(),
        expiresAt: payload.expiresAt,
        isEphemeral,
      })
    );

    const cookieOptions = createSessionCookieOptions(
      isProduction,
      !isEphemeral,
      remainingSeconds
    );
    const response = successResponse({
      success: true,
      activeBranchId: branchContext.activeBranchId,
      activeBranchName: branchContext.branch.name,
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
        detail: error instanceof Error ? error.message : "Access denied to branch.",
      });
    }
    console.error("Error switching branch:", error);
    return problemResponse({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      title: "Internal Server Error",
      detail: error instanceof Error ? error.message : "Internal server error.",
    });
  }
}
