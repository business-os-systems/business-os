import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { problemResponse, successResponse } from "@/lib/api-response";
import {
  updateMemberStatus,
  SafeguardViolationError,
  NotFoundError,
} from "@/services/members.service";

const updateStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"], {
    errorMap: () => ({ message: "Status must be ACTIVE or SUSPENDED" }),
  }),
});

export async function PATCH(
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
    const body = await request.json().catch(() => null);
    const parseResult = updateStatusSchema.safeParse(body);

    if (!parseResult.success) {
      return problemResponse({
        type: "/errors/validation-error",
        title: "Validation Failed",
        status: 422,
        detail: parseResult.error.errors[0]?.message || "Invalid input payload.",
        extra: {
          errors: parseResult.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
        code: "VALIDATION_ERROR",
      });
    }

    const updated = await updateMemberStatus(
      session.organizationId!,
      id,
      parseResult.data
    );

    return successResponse({ member: updated }, { status: 200 });
  } catch (error) {
    if (error instanceof SafeguardViolationError) {
      return problemResponse({
        type: "/errors/safeguard-violation",
        title: "Action Prohibited by Security Safeguard",
        status: 403,
        detail: error.message,
        code: "LAST_ADMIN_PROTECTION",
      });
    }

    if (error instanceof NotFoundError) {
      return problemResponse({
        type: "/errors/not-found",
        title: "Member Not Found",
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
