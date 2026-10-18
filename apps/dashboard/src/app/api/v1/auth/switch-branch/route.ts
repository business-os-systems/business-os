import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@suite/db";
import {
  switchActiveBranch,
  signSessionToken,
  encodeSessionPayload,
  createSessionCookieOptions,
  SESSION_COOKIE_NAME,
  ForbiddenError,
} from "@suite/auth";
import { isProduction } from "@/lib/env";
import { getAuthenticatedSession } from "@/lib/session-helper";

const switchBranchSchema = z.object({
  branchId: z.string().min(1, "Branch ID is required"),
});

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

    const { branchId } = parseResult.data;
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value || "";

    // Switch branch context through verified membership/entitlement
    const branchResult = await switchActiveBranch({
      sessionToken: sessionCookie,
      branchId,
      prisma,
    });
    const branchContext = branchResult.data;

    // Mint updated session token with new active branch claims
    const updatedPayload = encodeSessionPayload({
      ...payload,
      organizationId: branchContext.activeOrganizationId,
      activeBranchId: branchContext.activeBranchId,
      activeBranchName: branchContext.branch.name,
      permissions: branchContext.permissions,
      role: branchContext.effectiveRoles[0] || payload.role,
      timestamp: Date.now(),
    });

    const tokenJwt = await signSessionToken(updatedPayload);
    const cookieOptions = createSessionCookieOptions(isProduction, true);

    const response = NextResponse.json({
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
    if (
      error instanceof ForbiddenError ||
      (error &&
        typeof error === "object" &&
        (("status" in error && error.status === 403) ||
          ("statusCode" in error && error.statusCode === 403)))
    ) {
      return NextResponse.json(
        {
          type: "/errors/forbidden",
          title: "Forbidden",
          status: 403,
          detail: error instanceof Error ? error.message : "Access denied to branch.",
          code: "FORBIDDEN",
        },
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    return NextResponse.json(
      {
        type: "/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: error instanceof Error ? error.message : "Internal server error.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
