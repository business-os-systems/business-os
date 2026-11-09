import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { getAuthenticatedSession } from "@/lib/session-helper";
import {
  getAddressById,
  updateAddressRecord,
  deleteAddressRecord,
} from "@/services/addresses.service";

const updateAddressSchema = z.object({
  addressType: z.enum(["URBAN", "RURAL"]).optional(),
  streetAddress: z
    .string()
    .trim()
    .min(2, "Street address must be at least 2 characters")
    .max(255, "Street address cannot exceed 255 characters")
    .nullable()
    .optional(),
  village: z.string().trim().max(191).nullable().optional(),
  postOffice: z.string().trim().max(191).nullable().optional(),
  district: z.string().trim().max(100).nullable().optional(),
  landmark: z.string().trim().max(191).nullable().optional(),
  city: z
    .string()
    .trim()
    .max(100, "City cannot exceed 100 characters")
    .nullable()
    .optional(),
  state: z
    .string()
    .trim()
    .min(1, "State is required")
    .max(100, "State cannot exceed 100 characters")
    .optional(),
  postalCode: z
    .string()
    .trim()
    .min(1, "Postal code is required")
    .max(20, "Postal code cannot exceed 20 characters")
    .optional(),
  country: z
    .string()
    .trim()
    .length(2, "Country code must be 2 characters (ISO-3166)")
    .optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  googlePlaceId: z.string().trim().max(255).nullable().optional(),
  mapUrl: z.string().trim().nullable().optional(),
});

export async function GET(
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

    const canRead =
      hasPermission(userPermissions, PERMISSIONS.CORE.ORGANIZATION_READ) ||
      hasPermission(userPermissions, PERMISSIONS.CORE.BRANCHES_READ);

    if (!canRead) {
      return NextResponse.json(
        {
          type: "/errors/forbidden",
          title: "Access Denied",
          status: 403,
          detail: `Required permission '${PERMISSIONS.CORE.ORGANIZATION_READ}' is missing from user claims.`,
          code: "FORBIDDEN",
        },
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const { id: addressId } = await context.params;

    const address = await getAddressById(session.organizationId, addressId);
    if (!address) {
      return NextResponse.json(
        {
          type: "/errors/not-found",
          title: "Address Not Found",
          status: 404,
          detail: `Address '${addressId}' was not found in your organization.`,
          code: "ADDRESS_NOT_FOUND",
        },
        { status: 404, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    return NextResponse.json({ data: address });
  } catch (error) {
    console.error("GET /api/v1/settings/addresses/[id] error:", error);
    return NextResponse.json(
      {
        type: "/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: "An unexpected error occurred while fetching the address.",
        code: "INTERNAL_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}

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

    const canWrite =
      hasPermission(userPermissions, PERMISSIONS.CORE.ORGANIZATION_UPDATE) ||
      hasPermission(userPermissions, PERMISSIONS.CORE.BRANCHES_WRITE);

    if (!canWrite) {
      return NextResponse.json(
        {
          type: "/errors/forbidden",
          title: "Access Denied",
          status: 403,
          detail: `Required permission '${PERMISSIONS.CORE.ORGANIZATION_UPDATE}' is missing from user claims.`,
          code: "FORBIDDEN",
        },
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const { id: addressId } = await context.params;

    const existingAddress = await getAddressById(
      session.organizationId,
      addressId
    );

    if (!existingAddress) {
      return NextResponse.json(
        {
          type: "/errors/not-found",
          title: "Address Not Found",
          status: 404,
          detail: `Address '${addressId}' was not found in your organization.`,
          code: "ADDRESS_NOT_FOUND",
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

    const parseResult = updateAddressSchema.safeParse(bodyJson);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          type: "/errors/validation-error",
          title: "Validation Error",
          status: 400,
          detail: "Request payload failed validation schema.",
          errors: parseResult.error.flatten().fieldErrors,
          code: "VALIDATION_ERROR",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const updated = await updateAddressRecord(
      session.organizationId,
      addressId,
      parseResult.data
    );

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/v1/settings/addresses/[id] error:", error);
    return NextResponse.json(
      {
        type: "/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: "An unexpected error occurred while updating the address.",
        code: "INTERNAL_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}

export async function DELETE(
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

    const canWrite =
      hasPermission(userPermissions, PERMISSIONS.CORE.ORGANIZATION_UPDATE) ||
      hasPermission(userPermissions, PERMISSIONS.CORE.BRANCHES_WRITE);

    if (!canWrite) {
      return NextResponse.json(
        {
          type: "/errors/forbidden",
          title: "Access Denied",
          status: 403,
          detail: `Required permission '${PERMISSIONS.CORE.ORGANIZATION_UPDATE}' is missing from user claims.`,
          code: "FORBIDDEN",
        },
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const { id: addressId } = await context.params;

    const result = await deleteAddressRecord(
      session.organizationId,
      addressId
    );

    if (!result.success) {
      if (result.code === "NOT_FOUND") {
        return NextResponse.json(
          {
            type: "/errors/not-found",
            title: "Address Not Found",
            status: 404,
            detail: result.message,
            code: "ADDRESS_NOT_FOUND",
          },
          { status: 404, headers: { "Content-Type": "application/problem+json" } }
        );
      }

      if (result.code === "CONFLICT") {
        return NextResponse.json(
          {
            type: "/errors/conflict",
            title: "Address Actively In Use",
            status: 409,
            detail: result.message,
            inUseReason: result.inUseReason,
            code: "ADDRESS_IN_USE",
          },
          { status: 409, headers: { "Content-Type": "application/problem+json" } }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Address deleted successfully.",
    });
  } catch (error) {
    console.error("DELETE /api/v1/settings/addresses/[id] error:", error);
    return NextResponse.json(
      {
        type: "/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: "An unexpected error occurred while deleting the address.",
        code: "INTERNAL_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
