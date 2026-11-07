import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { quotaAwareProblemResponse } from "@/lib/quota-problem";
import {
  listOrganizationBranches,
  createBranchRecord,
  checkBranchCodeConflict,
} from "@/services/branches.service";

const createBranchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Branch name must be at least 2 characters")
    .max(191, "Branch name cannot exceed 191 characters"),
  code: z
    .string()
    .trim()
    .min(2, "Branch code must be at least 2 characters")
    .max(32, "Branch code cannot exceed 32 characters")
    .regex(
      /^[A-Z0-9_-]+$/,
      "Branch code must contain only uppercase alphanumeric characters, hyphens, and underscores"
    ),
  type: z
    .string()
    .trim()
    .min(2, "Branch type must be at least 2 characters")
    .max(64, "Branch type cannot exceed 64 characters"),
  capabilities: z.array(z.string().trim()).default([]),
  timezone: z.string().trim().max(64).default("Asia/Kolkata"),
  nightAuditHour: z.number().int().min(0).max(23).default(4),
  currency: z.string().trim().length(3).optional(),
  locale: z.string().trim().min(2).max(10).optional(),
  dateFormat: z.string().trim().max(20).optional(),
  timeFormat: z.string().trim().max(5).optional(),
  taxIdentifier: z.string().trim().max(64).nullable().optional(),
  addressId: z.string().trim().nullable().optional(),
  parentBranchId: z.string().trim().nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedSession(request, {
      requireOrganization: true,
    });

    if (!authResult.ok) {
      return authResult.response;
    }

    const { session } = authResult;
    const userPermissions = session.permissions ?? [];

    if (!hasPermission(userPermissions, PERMISSIONS.CORE.BRANCHES_READ)) {
      return NextResponse.json(
        {
          type: "/errors/forbidden",
          title: "Access Denied",
          status: 403,
          detail: `Required permission '${PERMISSIONS.CORE.BRANCHES_READ}' is missing from user claims.`,
          code: "FORBIDDEN",
        },
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status") || undefined;

    const branches = await listOrganizationBranches(session.organizationId!, {
      status: statusParam,
    });

    return NextResponse.json({ branches }, { status: 200 });
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

export async function POST(request: NextRequest) {
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

    const parseResult = createBranchSchema.safeParse(bodyJson);
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

    // Check unique code collision in this tenant
    const hasConflict = await checkBranchCodeConflict(
      session.organizationId!,
      data.code
    );

    if (hasConflict) {
      return NextResponse.json(
        {
          type: "/errors/conflict",
          title: "Branch Code Conflict",
          status: 409,
          detail: `A branch with code '${data.code}' already exists in this organization.`,
          code: "BRANCH_CODE_ALREADY_EXISTS",
        },
        { status: 409, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const created = await createBranchRecord(session.organizationId!, data);

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return quotaAwareProblemResponse(error, {
      detail:
        error instanceof Error ? error.message : "Internal server error.",
    });
  }
}
