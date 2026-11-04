import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  decodeSessionPayload,
  isSessionPayloadExpired,
  isSessionPayloadIdleTimedOut,
  type SessionPayload,
} from "@suite/auth";
import { TENANT_STATUS } from "@suite/core";
import { readDashboardTenantStatus } from "./tenant-access";

export interface SessionVerificationOptions {
  requireOrganization?: boolean;
}

function blockedWorkspaceResponse(
  status: number,
  code: string,
  detail: string
): NextResponse {
  return NextResponse.json(
    {
      type: `/errors/${code.toLowerCase().replace(/_/g, "-")}`,
      title: "Forbidden",
      status,
      detail,
      code,
    },
    { status, headers: { "Content-Type": "application/problem+json" } }
  );
}

export type AuthenticatedSessionResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; response: NextResponse };

/**
 * Standardized session authentication and claim extraction helper for route handlers.
 * Eliminates duplicated cookie inspection, HMAC signature verification, and RFC 7807 error responses.
 */
export async function getAuthenticatedSession(
  request: NextRequest,
  options: SessionVerificationOptions = {}
): Promise<AuthenticatedSessionResult> {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          type: "/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Authentication session required.",
          code: "UNAUTHORIZED",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      ),
    };
  }

  const isValid = await verifySessionToken(sessionCookie);
  if (!isValid) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          type: "/errors/invalid-session",
          title: "Invalid Session",
          status: 401,
          detail: "Session token is invalid or expired.",
          code: "INVALID_SESSION",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      ),
    };
  }

  const session = decodeSessionPayload(sessionCookie);
  if (!session?.userId) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          type: "/errors/invalid-payload",
          title: "Bad Request",
          status: 400,
          detail: "Invalid session claims payload.",
          code: "INVALID_SESSION_PAYLOAD",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      ),
    };
  }

  // Enforce temporal lifespan expiration check (Issue 38)
  if (isSessionPayloadExpired(session)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          type: "/errors/session-expired",
          title: "Session Expired",
          status: 401,
          detail: "Authentication session has expired. Please sign in again.",
          code: "SESSION_EXPIRED",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      ),
    };
  }

  // Enforce session idle timeout if configured in preferences (Issue 47)
  if (isSessionPayloadIdleTimedOut(session)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          type: "/errors/session-idle-timeout",
          title: "Session Idle Timeout",
          status: 401,
          detail: "Session has timed out due to inactivity.",
          code: "SESSION_IDLE_TIMEOUT",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } }
      ),
    };
  }

  // A platform suspension or archive blocks every tenant-plane request, not
  // only page renders (FR-017, FR-019).
  if (session.organizationId) {
    const status = await readDashboardTenantStatus(session.organizationId);
    if (status === TENANT_STATUS.SUSPENDED) {
      return {
        ok: false,
        response: blockedWorkspaceResponse(
          403,
          "TENANT_SUSPENDED",
          "This workspace is suspended. Contact your platform administrator."
        ),
      };
    }
    if (status === TENANT_STATUS.ARCHIVED) {
      return {
        ok: false,
        response: blockedWorkspaceResponse(
          403,
          "TENANT_ARCHIVED",
          "This workspace is archived and its data is no longer accessible."
        ),
      };
    }
    // An unknown organisation row is not a lifecycle state: the tenant data
    // path (apps/api) denies it with 404, and the page fails on its own. This
    // guard refuses only a workspace the platform has actually blocked.
    if (status === null) {
      return { ok: true, session };
    }
  }

  if (options.requireOrganization && !session.organizationId) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          type: "/errors/invalid-payload",
          title: "Bad Request",
          status: 400,
          detail: "Active organization context is required.",
          code: "ORGANIZATION_REQUIRED",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      ),
    };
  }

  return { ok: true, session };
}
