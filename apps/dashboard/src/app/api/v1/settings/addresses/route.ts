import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { getAuthenticatedSession } from "@/lib/session-helper";
import {
  listOrganizationAddresses,
  createAddressRecord,
} from "@/services/addresses.service";

const baseAddressFields = {
  landmark: z.string().trim().max(191).nullable().optional(),
  state: z
    .string()
    .trim()
    .min(1, "State is required")
    .max(100, "State cannot exceed 100 characters"),
  postalCode: z
    .string()
    .trim()
    .min(1, "Postal code is required")
    .max(20, "Postal code cannot exceed 20 characters"),
  country: z
    .string()
    .trim()
    .length(2, "Country code must be 2 characters (ISO-3166)")
    .default("IN")
    .optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  googlePlaceId: z.string().trim().max(255).nullable().optional(),
  mapUrl: z.string().trim().nullable().optional(),
};

const urbanAddressSchema = z.object({
  addressType: z.literal("URBAN"),
  streetAddress: z
    .string()
    .trim()
    .min(2, "Street address must be at least 2 characters")
    .max(255, "Street address cannot exceed 255 characters"),
  city: z
    .string()
    .trim()
    .min(1, "City is required")
    .max(100, "City cannot exceed 100 characters"),
  village: z.string().nullable().optional(),
  postOffice: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  ...baseAddressFields,
});

const ruralAddressSchema = z.object({
  addressType: z.literal("RURAL"),
  village: z
    .string()
    .trim()
    .min(1, "Village is required for rural address")
    .max(191, "Village cannot exceed 191 characters"),
  postOffice: z
    .string()
    .trim()
    .min(1, "Post office is required for rural address")
    .max(191, "Post office cannot exceed 191 characters"),
  district: z
    .string()
    .trim()
    .min(1, "District is required for rural address")
    .max(100, "District cannot exceed 100 characters"),
  streetAddress: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  ...baseAddressFields,
});

const createAddressSchema = z.preprocess(
  (val) => {
    if (val && typeof val === "object" && !("addressType" in val)) {
      return { ...val, addressType: "URBAN" };
    }
    return val;
  },
  z.discriminatedUnion("addressType", [urbanAddressSchema, ruralAddressSchema])
);

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

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || undefined;

    const addresses = await listOrganizationAddresses(
      session.organizationId!,
      search
    );

    return NextResponse.json({
      data: addresses,
      meta: {
        total: addresses.length,
      },
    });
  } catch (error) {
    console.error("GET /api/v1/settings/addresses error:", error);
    return NextResponse.json(
      {
        type: "/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: "An unexpected error occurred while fetching operational addresses.",
        code: "INTERNAL_ERROR",
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

    const parseResult = createAddressSchema.safeParse(bodyJson);
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

    const createdAddress = await createAddressRecord(
      session.organizationId!,
      parseResult.data
    );

    return NextResponse.json({ data: createdAddress }, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/settings/addresses error:", error);
    return NextResponse.json(
      {
        type: "/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: "An unexpected error occurred while creating operational address.",
        code: "INTERNAL_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } }
    );
  }
}
