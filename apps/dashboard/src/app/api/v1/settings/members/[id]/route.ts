import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { problemResponse, successResponse } from "@/lib/api-response";
import {
  updateMemberDetails,
  removeMember,
  SafeguardViolationError,
  NotFoundError,
} from "@/services/members.service";

const updateMemberSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").optional(),
  mobile: z.string().trim().nullable().optional(),
  roleId: z.string().trim().min(1, "Role is required").optional(),
  roleIds: z.array(z.string().trim()).optional(),
  branchId: z.string().trim().nullable().optional(),
  branchIds: z.array(z.string().trim()).optional(),
  managerPin: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((val) => (val === "" ? undefined : val))
    .refine((val) => !val || /^\d{4,6}$/.test(val), {
      message: "POS / Terminal PIN must be between 4 and 6 numeric digits",
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
    const parseResult = updateMemberSchema.safeParse(body);

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

    const updated = await updateMemberDetails(
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
      type: "/errors/internal-error",
      title: "Internal Server Error",
      status: 500,
      detail: error instanceof Error ? error.message : "Internal server error.",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}

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

    const result = await removeMember(session.organizationId!, id);

    return successResponse(result, { status: 200 });
  } catch (error) {
    if (error instanceof SafeguardViolationError) {
      return problemResponse({
        type: "/errors/safeguard-violation",
        title: "Action Prohibited by Security Safeguard",
        status: 403,
        detail: error.message,
        code: "SAFEGUARD_VIOLATION",
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
      type: "/errors/internal-error",
      title: "Internal Server Error",
      status: 500,
      detail: error instanceof Error ? error.message : "Internal server error.",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}

