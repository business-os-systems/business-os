import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { getAuthenticatedSession } from "@/lib/session-helper";
import {
  getBranchById,
  updateBranchRecord,
} from "@/services/branches.service";

const updateBranchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Branch name must be at least 2 characters")
    .max(191, "Branch name cannot exceed 191 characters")
    .optional(),
  code: z.string().optional(),
  type: z
    .string()
    .trim()
    .min(2, "Branch type must be at least 2 characters")
    .max(64, "Branch type cannot exceed 64 characters")
    .optional(),
  capabilities: z.array(z.string().trim()).optional(),
  status: z
    .enum(["ACTIVE", "TEMPORARILY_CLOSED", "ARCHIVED"])
    .optional(),
  timezone: z.string().trim().max(64).optional(),
  nightAuditHour: z.number().int().min(0).max(23).optional(),
  currency: z.string().trim().length(3).optional(),
  locale: z.string().trim().min(2).max(10).optional(),
  dateFormat: z.string().trim().max(20).optional(),
  timeFormat: z.string().trim().max(5).optional(),
  taxIdentifier: z.string().trim().max(64).nullable().optional(),
  addressId: z.string().trim().nullable().optional(),
  parentBranchId: z.string().trim().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await getAuthenticatedSession(request, {
      requireOrganization: true,
    });

    if (!authResult.ok) {
      return authResult.response;
    }

    const { session } = authResult;
    const userPermissions = session.permissions ?? [];

    if (!hasPermission(userPermissions, PERMISSIONS.CORE.BRANCHES_WRITE)) {
      return NextResponse.json(
        {
          type: "/errors/forbidden",
          title: "Access Denied",
          status: 403,
          detail: `Required permission '${PERMISSIONS.CORE.BRANCHES_WRITE}' is missing from user claims.`,
          code: "FORBIDDEN",
        },
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const { id: branchId } = await context.params;

    const existingBranch = await getBranchById(
      session.organizationId!,
      branchId
    );

    if (!existingBranch) {
      return NextResponse.json(
        {
          type: "/errors/not-found",
          title: "Branch Not Found",
          status: 404,
          detail: `Branch '${branchId}' was not found in your organization.`,
          code: "BRANCH_NOT_FOUND",
        },
        { status: 404, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const bodyJson = await request.json().catch(() => null);
    if (!bodyJson) {
      return NextResponse.json(
        {
          type: "/errors/bad-request",
          title: "Invalid JSON",
          status: 400,
          detail: "Malformed JSON payload in request body.",
          code: "INVALID_JSON",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const parseResult = updateBranchSchema.safeParse(bodyJson);
    if (!parseResult.success) {
      const invalidParams = parseResult.error.issues.map((issue) => ({
        name: issue.path.join("."),
        reason: issue.message,
      }));

      return NextResponse.json(
        {
          type: "/errors/validation-error",
          title: "Validation Error",
          status: 400,
          detail: "One or more branch fields failed validation.",
          code: "VALIDATION_ERROR",
          invalidParams,
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const data = parseResult.data;

    // Enforce branch code immutability
    if (data.code !== undefined && data.code !== existingBranch.code) {
      return NextResponse.json(
        {
          type: "/errors/bad-request",
          title: "Immutable Field",
          status: 400,
          detail: "Branch code is immutable and cannot be modified after registration.",
          code: "BRANCH_CODE_IMMUTABLE",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    // Exclude code from update payload
    const { code: _, ...updatePayload } = data;

    const updated = await updateBranchRecord(
      session.organizationId!,
      branchId,
      updatePayload
    );

    return NextResponse.json(updated, { status: 200 });
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
