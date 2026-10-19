import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { getAuthenticatedSession } from "@/lib/session-helper";
import {
  updateOrganizationRole,
  deleteOrganizationRole,
} from "@/services/roles.service";
import {
  NotFoundError,
  ConflictError,
  SafeguardViolationError,
} from "@/services/members.service";

const updateRoleSchema = z.object({
  name: z.string().trim().min(2, "Role name must be at least 2 characters").optional(),
  description: z.string().trim().max(255).optional().nullable(),
  permissionActions: z.array(z.string()).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const authResult = await getAuthenticatedSession(request, {
      requireOrganization: true,
    });

    if (!authResult.ok) {
      return authResult.response;
    }

    const { session } = authResult;
    const userPermissions = session.permissions ?? [];

    const canManageRoles = hasPermission(
      userPermissions,
      PERMISSIONS.CORE.ROLES_MANAGE
    );

    if (!canManageRoles) {
      return NextResponse.json(
        {
          type: "/errors/forbidden",
          title: "Access Denied",
          status: 403,
          detail: `Required permission '${PERMISSIONS.CORE.ROLES_MANAGE}' is missing from user claims.`,
          code: "FORBIDDEN",
        },
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parseResult = updateRoleSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          type: "/errors/validation-error",
          title: "Invalid Input",
          status: 422,
          detail: parseResult.error.errors.map((e) => e.message).join(", "),
          code: "VALIDATION_ERROR",
          errors: parseResult.error.flatten(),
        },
        { status: 422, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const role = await updateOrganizationRole(
      session.organizationId!,
      id,
      parseResult.data
    );

    return NextResponse.json({ role }, { status: 200 });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        {
          type: "/errors/not-found",
          title: "Role Not Found",
          status: 404,
          detail: error.message,
          code: "ROLE_NOT_FOUND",
        },
        { status: 404, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    if (error instanceof SafeguardViolationError) {
      return NextResponse.json(
        {
          type: "/errors/safeguard-violation",
          title: "Safeguard Protected",
          status: 403,
          detail: error.message,
          code: "SAFEGUARD_VIOLATION",
        },
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    if (error instanceof ConflictError) {
      return NextResponse.json(
        {
          type: "/errors/conflict",
          title: "Role Conflict",
          status: 409,
          detail: error.message,
          code: "ROLE_CONFLICT",
        },
        { status: 409, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    return NextResponse.json(
      {
        type: "/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: error instanceof Error ? error.message : "Failed to update role.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const authResult = await getAuthenticatedSession(request, {
      requireOrganization: true,
    });

    if (!authResult.ok) {
      return authResult.response;
    }

    const { session } = authResult;
    const userPermissions = session.permissions ?? [];

    const canManageRoles = hasPermission(
      userPermissions,
      PERMISSIONS.CORE.ROLES_MANAGE
    );

    if (!canManageRoles) {
      return NextResponse.json(
        {
          type: "/errors/forbidden",
          title: "Access Denied",
          status: 403,
          detail: `Required permission '${PERMISSIONS.CORE.ROLES_MANAGE}' is missing from user claims.`,
          code: "FORBIDDEN",
        },
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    await deleteOrganizationRole(session.organizationId!, id);

    return NextResponse.json(
      { success: true, message: "Role deleted successfully." },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        {
          type: "/errors/not-found",
          title: "Role Not Found",
          status: 404,
          detail: error.message,
          code: "ROLE_NOT_FOUND",
        },
        { status: 404, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    if (error instanceof SafeguardViolationError) {
      return NextResponse.json(
        {
          type: "/errors/safeguard-violation",
          title: "Safeguard Protected",
          status: 403,
          detail: error.message,
          code: "SAFEGUARD_VIOLATION",
        },
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    if (error instanceof ConflictError) {
      return NextResponse.json(
        {
          type: "/errors/conflict",
          title: "Role In Use",
          status: 409,
          detail: error.message,
          code: "ROLE_IN_USE",
        },
        { status: 409, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    return NextResponse.json(
      {
        type: "/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: error instanceof Error ? error.message : "Failed to delete role.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
