import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { getAuthenticatedSession } from "@/lib/session-helper";
import {
  listOrganizationMembers,
  inviteOrganizationMember,
  createDirectMember,
  ConflictError,
  NotFoundError,
} from "@/services/members.service";

const directAddMemberSchema = z
  .object({
    action: z.literal("add").optional(),
    name: z.string().trim().min(2, "Staff member name must be at least 2 characters"),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("A valid email address is required"),
    mobile: z.string().trim().nullable().optional(),
    roleId: z.string().trim().optional(),
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
  })
  .refine((data) => (data.roleIds && data.roleIds.length > 0) || !!data.roleId, {
    message: "At least one role is required",
    path: ["roleId"],
  });

const inviteMemberSchema = z
  .object({
    action: z.literal("invite").optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("A valid email address is required"),
    roleId: z.string().trim().optional(),
    roleIds: z.array(z.string().trim()).optional(),
    branchId: z.string().trim().nullable().optional(),
    branchIds: z.array(z.string().trim()).optional(),
    isPreRegistered: z.boolean().optional(),
  })
  .refine((data) => (data.roleIds && data.roleIds.length > 0) || !!data.roleId, {
    message: "At least one role is required",
    path: ["roleId"],
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

    if (!hasPermission(userPermissions, PERMISSIONS.CORE.USERS_READ)) {
      return NextResponse.json(
        {
          type: "/errors/forbidden",
          title: "Access Denied",
          status: 403,
          detail: `Required permission '${PERMISSIONS.CORE.USERS_READ}' is missing from user claims.`,
          code: "FORBIDDEN",
        },
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const members = await listOrganizationMembers(session.organizationId!);
    return NextResponse.json({ members }, { status: 200 });
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

    const body = await request.json().catch(() => ({}));
    const isDirectAdd = body.action === "add" || (typeof body.name === "string" && body.name.trim().length > 0);

    if (isDirectAdd) {
      const parseResult = directAddMemberSchema.safeParse(body);
      if (!parseResult.success) {
        return NextResponse.json(
          {
            type: "/errors/validation-error",
            title: "Validation Failed",
            status: 422,
            detail: parseResult.error.errors[0]?.message || "Invalid member data.",
            errors: parseResult.error.errors.map((e) => ({
              field: e.path.join("."),
              message: e.message,
            })),
            code: "VALIDATION_ERROR",
          },
          { status: 422, headers: { "Content-Type": "application/problem+json" } }
        );
      }

      const { member, inviteUrl } = await createDirectMember(
        session.organizationId!,
        parseResult.data,
        session.userId
      );

      return NextResponse.json({ member, inviteUrl }, { status: 201 });
    }

    // Default: Invitation creation
    const parseResult = inviteMemberSchema.safeParse(body);
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

    const result = await inviteOrganizationMember(
      session.organizationId!,
      session.userId,
      parseResult.data
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json(
        {
          type: "/errors/conflict",
          title: "Member Already Exists",
          status: 409,
          detail: error.message,
          code: "MEMBER_CONFLICT",
        },
        { status: 409, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    if (error instanceof NotFoundError) {
      return NextResponse.json(
        {
          type: "/errors/not-found",
          title: "Resource Not Found",
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
