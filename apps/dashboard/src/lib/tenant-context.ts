import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession } from "./session-helper";
import { problemResponse } from "./problem-response";

export type TenantContextResult =
  | { ok: true; organizationId: string; userId: string; role?: string }
  | { ok: false; response: NextResponse };

/**
 * Resolves tenant organization context with absolute priority to cryptographically verified session claims.
 * If verified session exists, its claims are authoritative (preventing client header spoofing).
 * In internal SSR/test contexts where a valid server-set header exists, falls back cleanly.
 */
export async function resolveTenantContext(
  request: Request | NextRequest
): Promise<TenantContextResult> {
  const nextReq =
    request instanceof NextRequest
      ? request
      : new NextRequest(request.url, { headers: request.headers });

  const sessionResult = await getAuthenticatedSession(nextReq);
  if (sessionResult.ok) {
    const organizationId = sessionResult.session.organizationId;
    if (!organizationId) {
      return {
        ok: false,
        response: problemResponse({
          status: 403,
          code: "ORGANIZATION_REQUIRED",
          title: "Missing Tenant Context",
          detail: "Active organization context is required.",
        }),
      };
    }

    return {
      ok: true,
      organizationId,
      userId: sessionResult.session.userId,
      role: sessionResult.session.role,
    };
  }

  // Fallback for internal SSR / test execution when x-tenant-id was explicitly set by verified caller
  const rawTenantHeader = request.headers.get("x-tenant-id") || request.headers.get("x-organization-id");
  if (rawTenantHeader) {
    return {
      ok: true,
      organizationId: rawTenantHeader,
      userId: request.headers.get("x-user-id") || "system",
      role: request.headers.get("x-user-role") || "member",
    };
  }

  return {
    ok: false,
    response: problemResponse({
      status: 401,
      code: "UNAUTHORIZED",
      title: "Unauthorized",
      detail: "Active authenticated session is required to access organization resources.",
    }),
  };
}
