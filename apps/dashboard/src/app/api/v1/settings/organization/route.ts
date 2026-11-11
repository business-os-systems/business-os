import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS, hasPermission } from "@suite/core";
import {
  signSessionToken,
  encodeSessionPayload,
  createSessionCookieOptions,
  type SessionPayload,
} from "@suite/auth";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { problemResponse, successResponse } from "@/lib/api-response";
import {
  getOrganizationDetail,
  getOrganizationStatus,
  isCustomDomainClaimed,
  updateOrganizationRecord,
  type UpdateOrganizationInput,
} from "@/services/organization-settings.service";

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
  registeredAddressId: z
    .string()
    .trim()
    .nullable()
    .optional(),
});

type UpdateOrganizationDto = z.infer<typeof updateOrganizationSchema>;

async function parseAndValidateUpdateBody(
  request: NextRequest,
): Promise<{ ok: true; data: UpdateOrganizationDto } | { ok: false; response: NextResponse }> {
  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return {
      ok: false,
      response: problemResponse({
        type: "/errors/bad-request",
        title: "Invalid JSON",
        status: 400,
        detail: "Malformed JSON payload in request body.",
        code: "INVALID_JSON",
      }),
    };
  }

  const parseResult = updateOrganizationSchema.safeParse(bodyJson);
  if (!parseResult.success) {
    return {
      ok: false,
      response: problemResponse({
        type: "/errors/validation-error",
        title: "Validation Error",
        status: 400,
        detail: "One or more organization fields failed validation.",
        code: "VALIDATION_ERROR",
        invalidParams: parseResult.error.issues.map((issue) => ({
          name: issue.path.join("."),
          reason: issue.message,
        })),
      }),
    };
  }

  return { ok: true, data: parseResult.data };
}

async function ensureDomainAvailable(
  data: UpdateOrganizationDto,
  organizationId: string
): Promise<NextResponse | null> {
  if (!data.customDomain) {
    return null;
  }
  if (await isCustomDomainClaimed(data.customDomain, organizationId)) {
    return problemResponse({
      type: "/errors/conflict",
      title: "Domain Conflict",
      status: 409,
      detail: `The custom domain '${data.customDomain}' is already claimed by another organization.`,
      code: "DOMAIN_ALREADY_EXISTS",
    });
  }
  return null;
}

async function applySessionCookie(
  response: NextResponse,
  session: SessionPayload,
  data: UpdateOrganizationDto
): Promise<void> {
  if (data.status === "ARCHIVED") {
    const cookieOptions = createSessionCookieOptions(true);
    response.cookies.delete(cookieOptions.name);
    return;
  }
  if (!data.name || data.name === session.organizationName) {
    return;
  }

  const updatedPayload = encodeSessionPayload({
    ...session,
    organizationName: data.name,
    timestamp: Date.now(),
  });
  const tokenJwt = await signSessionToken(updatedPayload);
  const cookieOptions = createSessionCookieOptions(true);
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
      return problemResponse({
        type: "/errors/forbidden",
        title: "Access Denied",
        status: 403,
        detail: `Required permission '${PERMISSIONS.CORE.ORGANIZATION_READ}' is missing from user claims.`,
        code: "FORBIDDEN",
      });
    }

    const organization = await getOrganizationDetail(session.organizationId);
    if (!organization) {
      return problemResponse({
        type: "/errors/not-found",
        title: "Organization Not Found",
        status: 404,
        detail: `Organization '${session.organizationId}' was not found.`,
        code: "ORGANIZATION_NOT_FOUND",
      });
    }
    if (organization.status === "ARCHIVED") {
      return problemResponse({
        type: "/errors/forbidden",
        title: "Organization Archived",
        status: 403,
        detail: `Organization '${session.organizationId}' has been archived and cannot be accessed.`,
        code: "ORGANIZATION_ARCHIVED",
      });
    }

    return successResponse(organization);
  } catch (error) {
    return problemResponse({
      type: "/errors/internal-server-error",
      title: "Internal Server Error",
      status: 500,
      detail: error instanceof Error ? error.message : "Internal server error.",
      code: "INTERNAL_SERVER_ERROR",
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
    if (!hasPermission(session.permissions ?? [], PERMISSIONS.CORE.ORGANIZATION_UPDATE)) {
      return problemResponse({
        type: "/errors/forbidden",
        title: "Access Denied",
        status: 403,
        detail: `Required permission '${PERMISSIONS.CORE.ORGANIZATION_UPDATE}' is missing from user claims.`,
        code: "FORBIDDEN",
      });
    }

    const currentOrganization = await getOrganizationStatus(session.organizationId);
    if (!currentOrganization || currentOrganization.status === "ARCHIVED") {
      return problemResponse({
        type: "/errors/forbidden",
        title: "Organization Archived",
        status: 403,
        detail: "This organization has been archived and cannot be modified.",
        code: "ORGANIZATION_ARCHIVED",
      });
    }

    const payloadResult = await parseAndValidateUpdateBody(request);
    if (!payloadResult.ok) {
      return payloadResult.response;
    }

    const conflictResponse = await ensureDomainAvailable(
      payloadResult.data,
      session.organizationId
    );
    if (conflictResponse) {
      return conflictResponse;
    }

    const updateInput: UpdateOrganizationInput = payloadResult.data;
    const updated = await updateOrganizationRecord(session.organizationId, updateInput);
    const response = successResponse(updated);
    await applySessionCookie(response, session, payloadResult.data);
    return response;
  } catch (error) {
    return problemResponse({
      type: "/errors/internal-server-error",
      title: "Internal Server Error",
      status: 500,
      detail: error instanceof Error ? error.message : "Internal server error.",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}
