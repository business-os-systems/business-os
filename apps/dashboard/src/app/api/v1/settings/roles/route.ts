import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { getAuthenticatedSession } from "@/lib/session-helper";
import {
  listOrganizationRolesWithPermissions,
  listSystemPermissions,
  createOrganizationRole,
} from "@/services/roles.service";
import { ConflictError } from "@/services/members.service";

const createRoleSchema = z.object({
  name: z.string().trim().min(2, "Role name must be at least 2 characters"),
  slug: z.string().trim().min(2).optional(),
  description: z.string().trim().max(255).optional(),
  permissionActions: z.array(z.string()).default([]),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await getAuthenticatedSession(request, {
      requireOrganization: true,
    });

    if (!authResult.ok) {
      return authResult.response;
    }

    const { session } = authResult;
    const userPermissions = session.permissions ?? [];

    const canReadRoles =
      hasPermission(userPermissions, PERMISSIONS.CORE.ROLES_READ) ||
      hasPermission(userPermissions, PERMISSIONS.CORE.USERS_READ);

    if (!canReadRoles) {
      return NextResponse.json(
        {
          type: "/errors/forbidden",
          title: "Access Denied",
          status: 403,
          detail: `Required permission '${PERMISSIONS.CORE.ROLES_READ}' is missing from user claims.`,
          code: "FORBIDDEN",
        },
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const [roles, permissions] = await Promise.all([
      listOrganizationRolesWithPermissions(session.organizationId!),
      listSystemPermissions(),
    ]);

    return NextResponse.json({ roles, permissions }, { status: 200 });
  } catch (error) {
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
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
    const parseResult = createRoleSchema.safeParse(body);

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

    const role = await createOrganizationRole(
      session.organizationId!,
      parseResult.data
    );

    return NextResponse.json({ role }, { status: 201 });
  } catch (error) {
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
        detail: error instanceof Error ? error.message : "Failed to create role.",
        code: "INTERNAL_SERVER_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
