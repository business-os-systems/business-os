import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { getAuthenticatedSession } from "@/lib/session-helper";
import {
  updateMemberRole,
  SafeguardViolationError,
  NotFoundError,
} from "@/services/members.service";

const updateRoleSchema = z.object({
  roleId: z.string().trim().min(1, "Role is required"),
  branchId: z.string().trim().nullable().optional(),
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
      return NextResponse.json(
        {
          type: "/errors/forbidden",
          title: "Access Denied",
          status: 403,
          detail: `Required permission '${PERMISSIONS.CORE.USERS_MANAGE}' is missing from user claims.`,
          code: "FORBIDDEN",
        },
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const parseResult = updateRoleSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          type: "/errors/validation-error",
          title: "Validation Failed",
          status: 422,
          detail: parseResult.error.errors[0]?.message || "Invalid input payload.",
          errors: parseResult.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
          code: "VALIDATION_ERROR",
        },
        { status: 422, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const updated = await updateMemberRole(
      session.organizationId!,
      id,
      parseResult.data
    );

    return NextResponse.json({ member: updated }, { status: 200 });
  } catch (error) {
    if (error instanceof SafeguardViolationError) {
      return NextResponse.json(
        {
          type: "/errors/safeguard-violation",
          title: "Action Prohibited by Security Safeguard",
          status: 403,
          detail: error.message,
          code: "LAST_ADMIN_PROTECTION",
        },
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    if (error instanceof NotFoundError) {
      return NextResponse.json(
        {
          type: "/errors/not-found",
          title: "Member Not Found",
          status: 404,
          detail: error.message,
          code: "NOT_FOUND",
        },
        { status: 404, headers: { "Content-Type": "application/problem+json" } }
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
