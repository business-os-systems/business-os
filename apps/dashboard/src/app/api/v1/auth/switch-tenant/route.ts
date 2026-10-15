import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@suite/db";
import {
  switchActiveTenant,
  SESSION_COOKIE_NAME,
  verifySessionToken,
  decodeSessionPayload,
  signSessionToken,
  encodeSessionPayload,
  createSessionCookieOptions,
  ForbiddenError,
} from "@suite/auth";
import { isProduction } from "@/lib/env";
import { resolvePostLoginRoute } from "@/lib/route-dispatcher";

const switchTenantSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json(
        {
          type: "/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Active session required to switch workspace context.",
          code: "UNAUTHORIZED",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const isValid = await verifySessionToken(sessionCookie);
    if (!isValid) {
      return NextResponse.json(
        {
          type: "/errors/invalid-session",
          title: "Invalid Session",
          status: 401,
          detail: "Session token signature is invalid or expired.",
          code: "INVALID_SESSION",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const payload = decodeSessionPayload(sessionCookie);
    if (!payload?.userId) {
      return NextResponse.json(
        {
          type: "/errors/invalid-payload",
          title: "Invalid Session Payload",
          status: 401,
          detail: "Session token is malformed.",
          code: "INVALID_PAYLOAD",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const body = await request.json().catch(() => null);
    const parseResult = switchTenantSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          type: "/errors/validation-failed",
          title: "Bad Request",
          status: 400,
          detail: parseResult.error.issues[0]?.message || "Validation failed",
          code: "VALIDATION_FAILED",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const { organizationId } = parseResult.data;

    // Switch tenant context through verified database membership
    const tenantContext = await switchActiveTenant({
      userId: payload.userId,
      targetOrganizationId: organizationId,
      prisma,
    });

    const redirectUrl = resolvePostLoginRoute({
      permissions: tenantContext.permissions,
      roleSlug: tenantContext.roleSlug,
      onboardingStatus: "COMPLETED",
    });

    // Mint updated session token with new active workspace claims
    const updatedPayload = encodeSessionPayload({
      userId: payload.userId,
      email: payload.email,
      userName: payload.userName,
      organizationId: tenantContext.organizationId,
      organizationName: tenantContext.organizationName,
      activeBranchId: tenantContext.activeBranchId || undefined,
      activeBranchName: tenantContext.activeBranchName || undefined,
      role: tenantContext.role,
      permissions: tenantContext.permissions,
      themePreference: payload.themePreference,
      timestamp: Date.now(),
      onboardingStatus: "COMPLETED",
      currentOnboardingStep: null,
    });

    const tokenJwt = await signSessionToken(updatedPayload);
    const cookieOptions = createSessionCookieOptions(isProduction, true);

    const response = NextResponse.json({
      success: true,
      redirectUrl: redirectUrl || "/dashboard",
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
    if (
      error instanceof ForbiddenError ||
      (error && typeof error === "object" && ("status" in error && error.status === 403 || "statusCode" in error && error.statusCode === 403))
    ) {
      return NextResponse.json(
        {
          type: "/errors/forbidden",
          title: "Forbidden",
          status: 403,
          detail: (error as Error).message || "You do not have access to this organization.",
          code: "FORBIDDEN",
        },
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    console.error("Error switching workspace context:", error);
    return NextResponse.json(
      {
        type: "/errors/internal-error",
        title: "Internal Server Error",
        status: 500,
        detail: "An unexpected error occurred while switching workspaces.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
