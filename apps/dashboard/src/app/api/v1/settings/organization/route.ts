import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@suite/db";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { getAuthenticatedSession } from "@/lib/session-helper";
import {
  signSessionToken,
  encodeSessionPayload,
  createSessionCookieOptions,
  type SessionPayload,
} from "@suite/auth";
import { isProduction } from "@/lib/env";

const updateOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters")
    .max(191, "Organization name cannot exceed 191 characters")
    .optional(),
  customDomain: z
    .string()
    .trim()
    .max(191, "Custom domain cannot exceed 191 characters")
    .nullable()
    .optional(),
  currency: z
    .string()
    .trim()
    .length(3, "Currency must be a 3-letter ISO code")
    .optional(),
  country: z
    .string()
    .trim()
    .length(2, "Country must be a 2-letter ISO country code")
    .optional(),
  defaultLocale: z
    .string()
    .trim()
    .min(2, "Locale must be at least 2 characters")
    .max(10, "Locale cannot exceed 10 characters")
    .optional(),
  jurisdiction: z
    .string()
    .trim()
    .min(2, "Jurisdiction must be at least 2 characters")
    .max(50, "Jurisdiction cannot exceed 50 characters")
    .optional(),
  status: z
    .enum(["ACTIVE", "TRIAL", "PAST_DUE", "SUSPENDED", "ARCHIVED"])
    .optional(),
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

    if (!hasPermission(userPermissions, PERMISSIONS.CORE.ORGANIZATION_READ)) {
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

    const organization = await prisma.organization.findUnique({
      where: { id: session.organizationId },
      include: {
        registeredAddress: true,
        taxProfile: true,
      },
    });

    if (!organization) {
      return NextResponse.json(
        {
          type: "/errors/not-found",
          title: "Organization Not Found",
          status: 404,
          detail: `Organization '${session.organizationId}' was not found.`,
          code: "ORGANIZATION_NOT_FOUND",
        },
        { status: 404, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    return NextResponse.json(organization, { status: 200 });
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

type UpdateOrganizationDto = z.infer<typeof updateOrganizationSchema>;

async function parseAndValidateUpdateBody(
  request: NextRequest,
): Promise<
  | { ok: true; data: UpdateOrganizationDto }
  | { ok: false; response: NextResponse }
> {
  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        {
          type: "/errors/bad-request",
          title: "Invalid JSON",
          status: 400,
          detail: "Malformed JSON payload in request body.",
          code: "INVALID_JSON",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      ),
    };
  }

  const parseResult = updateOrganizationSchema.safeParse(bodyJson);
  if (!parseResult.success) {
    const invalidParams = parseResult.error.issues.map((issue) => ({
      name: issue.path.join("."),
      reason: issue.message,
    }));

    return {
      ok: false,
      response: NextResponse.json(
        {
          type: "/errors/validation-error",
          title: "Validation Error",
          status: 400,
          detail: "One or more organization fields failed validation.",
          code: "VALIDATION_ERROR",
          invalidParams,
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } }
      ),
    };
  }

  return { ok: true, data: parseResult.data };
}

async function validateDomainConflict(
  customDomain: string | null | undefined,
  currentOrgId: string,
): Promise<NextResponse | null> {
  if (!customDomain) return null;

  const existingDomain = await prisma.organization.findFirst({
    where: {
      customDomain,
      id: { not: currentOrgId },
    },
  });

  if (existingDomain) {
    return NextResponse.json(
      {
        type: "/errors/conflict",
        title: "Domain Conflict",
        status: 409,
        detail: `The custom domain '${customDomain}' is already claimed by another organization.`,
        code: "DOMAIN_ALREADY_EXISTS",
      },
      { status: 409, headers: { "Content-Type": "application/problem+json" } }
    );
  }

  return null;
}

async function updateOrganizationRecord(
  organizationId: string,
  data: UpdateOrganizationDto,
) {
  return prisma.organization.update({
    where: { id: organizationId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.customDomain !== undefined && {
        customDomain: data.customDomain ? data.customDomain : null,
      }),
      ...(data.currency !== undefined && { currency: data.currency }),
      ...(data.country !== undefined && { country: data.country }),
      ...(data.defaultLocale !== undefined && { defaultLocale: data.defaultLocale }),
      ...(data.jurisdiction !== undefined && { jurisdiction: data.jurisdiction }),
      ...(data.status !== undefined && { status: data.status }),
    },
    include: {
      registeredAddress: true,
      taxProfile: true,
    },
  });
}

async function syncSessionCookieOnNameChange(
  response: NextResponse,
  session: SessionPayload,
  newName?: string,
) {
  if (newName && newName !== session.organizationName) {
    const updatedPayload = encodeSessionPayload({
      ...session,
      organizationName: newName,
      timestamp: Date.now(),
    });
    const tokenJwt = await signSessionToken(updatedPayload);
    const cookieOptions = createSessionCookieOptions(isProduction, true);
    response.cookies.set({
      name: cookieOptions.name,
      value: tokenJwt,
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
      maxAge: cookieOptions.maxAge,
    });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedSession(request, {
      requireOrganization: true,
    });

    if (!authResult.ok) {
      return authResult.response;
    }

    const { session } = authResult;
    const userPermissions = session.permissions ?? [];

    if (!hasPermission(userPermissions, PERMISSIONS.CORE.ORGANIZATION_UPDATE)) {
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

    const payloadResult = await parseAndValidateUpdateBody(request);
    if (!payloadResult.ok) {
      return payloadResult.response;
    }

    const conflictResponse = await validateDomainConflict(
      payloadResult.data.customDomain,
      session.organizationId!
    );
    if (conflictResponse) {
      return conflictResponse;
    }

    const updated = await updateOrganizationRecord(
      session.organizationId!,
      payloadResult.data
    );

    const response = NextResponse.json(updated, { status: 200 });
    await syncSessionCookieOnNameChange(response, session, payloadResult.data.name);

    return response;
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

