import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { problemResponse, successResponse } from "@/lib/api-response";
import {
  cancelOrganizationInvitation,
  NotFoundError,
} from "@/services/members.service";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const authResult = await getAuthenticatedSession(request, {
      requireOrganization: true,
    });

    if (!authResult.ok) {
      return authResult.response;
    }

    const { session } = authResult;
    const userPermissions = session.permissions ?? [];

    if (!hasPermission(userPermissions, PERMISSIONS.CORE.USERS_MANAGE)) {
      return problemResponse({
        type: "/errors/forbidden",
        title: "Access Denied",
        status: 403,
        detail: `Required permission '${PERMISSIONS.CORE.USERS_MANAGE}' is missing from user claims.`,
        code: "FORBIDDEN",
      });
    }

    const { id } = await context.params;

    await cancelOrganizationInvitation(session.organizationId, id);

    return successResponse({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return problemResponse({
        type: "/errors/not-found",
        title: "Invitation Not Found",
        status: 404,
        detail: error.message,
        code: "NOT_FOUND",
      });
    }

    return problemResponse({
      type: "/errors/internal-server-error",
      title: "Internal Server Error",
      status: 500,
      detail: error instanceof Error ? error.message : "Internal server error.",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}
