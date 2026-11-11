import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS, PLATFORM_ERROR_CODE, PLATFORM_ERROR_CODES } from "@suite/core";
import {
  provisionSiteFromTemplate,
  SITE_IDEMPOTENCY_KEY_PATTERN,
} from "@suite/website-builder/services";
import { isAppError } from "@suite/core/errors";
import { problemResponse, successResponse, zodProblemResponse } from "@/lib/problem-response";
import { quotaAwareProblemResponse } from "@/lib/quota-problem";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { evaluateWebsiteBuilderAccess } from "@/lib/website-builder-access";
import { listWebsiteSites } from "@/services/websites.service";
import { websiteSitesQuerySchema } from "@/app/(dashboard)/websites/websites.contract";
import type { WebsiteBuilderDenialReason } from "@/components/layout/website-builder-nav.config";

const CreateSiteSchema = z
  .object({
    title: z.string().trim().min(1, "Website title is required").max(120),
    slug: z.string().trim().min(1, "Subdomain slug is required").max(63),
    templateId: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .strict();

function readIdempotencyKey(request: NextRequest): string | null {
  const key = request.headers.get("idempotency-key")?.trim() ?? "";
  return SITE_IDEMPOTENCY_KEY_PATTERN.test(key) ? key : null;
}

function accessProblem(reason: WebsiteBuilderDenialReason, instance: string): NextResponse {
  switch (reason) {
    case "app_not_installed":
      return problemResponse({
        status: PLATFORM_ERROR_CODES.APP_NOT_INSTALLED.status,
        code: PLATFORM_ERROR_CODE.APP_NOT_INSTALLED,
        title: PLATFORM_ERROR_CODES.APP_NOT_INSTALLED.title,
        detail: "The Website Builder application is not installed for this workspace.",
        instance,
      });
    case "capability_denied":
      return problemResponse({
        status: PLATFORM_ERROR_CODES.CAPABILITY_DENIED.status,
        code: PLATFORM_ERROR_CODE.CAPABILITY_DENIED,
        title: PLATFORM_ERROR_CODES.CAPABILITY_DENIED.title,
        detail:
          "Your role does not include the capability required for this Website Builder action.",
        instance,
      });
    case "entitlements_unavailable":
      return problemResponse({
        status: PLATFORM_ERROR_CODES.DEPENDENCY_UNAVAILABLE.status,
        code: PLATFORM_ERROR_CODE.DEPENDENCY_UNAVAILABLE,
        title: PLATFORM_ERROR_CODES.DEPENDENCY_UNAVAILABLE.title,
        detail: "Website Builder entitlements could not be verified.",
        instance,
      });
  }
}

function parseSitesQuery(request: NextRequest) {
  const cursor = request.nextUrl.searchParams.get("cursor");
  const limit = request.nextUrl.searchParams.get("limit");
  return websiteSitesQuerySchema.safeParse({
    ...(cursor === null ? {} : { cursor }),
    ...(limit === null ? {} : { limit }),
  });
}

/**
 * Lists the caller's websites. Tenant identity is taken only from the verified
 * session, never from a header or query parameter, and the read runs under
 * row-level security (FR-013, FR-057, FR-059).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await getAuthenticatedSession(request, { requireOrganization: true });
  if (!auth.ok) {
    return auth.response;
  }

  const access = await evaluateWebsiteBuilderAccess({
    actor: auth.session,
    capability: PERMISSIONS.WEBSITE_BUILDER.SITES_READ,
  });
  if (access.kind === "denied") {
    return accessProblem(access.reason, request.nextUrl.pathname);
  }

  const parsedQuery = parseSitesQuery(request);
  if (!parsedQuery.success) {
    return zodProblemResponse(parsedQuery.error, {
      status: 400,
      code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
      title: "Invalid Sites Query",
      detail: "The sites query parameters are invalid.",
    });
  }

  try {
    const result = await listWebsiteSites({
      organizationId: auth.session.organizationId,
      cursor: parsedQuery.data.cursor,
      limit: parsedQuery.data.limit,
    });
    if (result.kind === "invalid_cursor") {
      return problemResponse({
        status: 400,
        code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
        title: "Invalid Sites Cursor",
        detail: "The sites cursor is not valid.",
        instance: request.nextUrl.pathname,
      });
    }
    return successResponse(result.page);
  } catch (error) {
    console.error("Error listing CMS sites:", error);
    return problemResponse({
      status: PLATFORM_ERROR_CODES.INTERNAL_ERROR.status,
      code: PLATFORM_ERROR_CODE.INTERNAL_ERROR,
      title: PLATFORM_ERROR_CODES.INTERNAL_ERROR.title,
      detail: "An unexpected error occurred while fetching sites.",
      instance: request.nextUrl.pathname,
    });
  }
}

type CreateSiteBody = z.infer<typeof CreateSiteSchema>;

function missingIdempotencyProblem(instance: string): NextResponse {
  return problemResponse({
    status: 400,
    code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
    title: "Idempotency Key Required",
    detail:
      "Send an Idempotency-Key header with 8 to 128 letters, digits, dot, colon, underscore or hyphen.",
    instance,
  });
}

async function readCreateSiteBody(
  request: NextRequest,
): Promise<
  | { readonly kind: "ok"; readonly body: CreateSiteBody }
  | { readonly kind: "invalid"; readonly response: NextResponse }
> {
  const rawBody: unknown = await request.json().catch(() => ({}));
  const parsed = CreateSiteSchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      kind: "invalid",
      response: zodProblemResponse(parsed.error, {
        status: 400,
        code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
        title: "Invalid Site Provisioning Payload",
        detail: "The site provisioning payload is invalid.",
      }),
    };
  }
  return { kind: "ok", body: parsed.data };
}

function provisioningProblem(error: unknown, instance: string): NextResponse {
  if (isAppError(error)) {
    return problemResponse({
      status: error.status,
      code: error.code,
      title: error.title,
      detail: error.detail,
      type: error.type,
      instance,
      ...(error.invalidParams === undefined ? {} : { invalidParams: error.invalidParams }),
    });
  }
  return quotaAwareProblemResponse(error, {
    code: PLATFORM_ERROR_CODE.INTERNAL_ERROR,
    detail: "An unexpected error occurred while provisioning site.",
    instance,
  });
}

/**
 * Creates a site from the authenticated tenant session. The tenant id is never
 * accepted from a header or body, and the caller must hold cms:sites:write
 * (FR-057, FR-059, CWE-862).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await getAuthenticatedSession(request, { requireOrganization: true });
  if (!auth.ok) {
    return auth.response;
  }
  const access = await evaluateWebsiteBuilderAccess({
    actor: auth.session,
    capability: PERMISSIONS.WEBSITE_BUILDER.SITES_WRITE,
  });
  if (access.kind === "denied") {
    return accessProblem(access.reason, request.nextUrl.pathname);
  }

  const idempotencyKey = readIdempotencyKey(request);
  if (idempotencyKey === null) {
    return missingIdempotencyProblem(request.nextUrl.pathname);
  }
  const parsed = await readCreateSiteBody(request);
  if (parsed.kind === "invalid") {
    return parsed.response;
  }

  try {
    const body = parsed.body;
    const result = await provisionSiteFromTemplate({
      organizationId: auth.session.organizationId,
      branchId: auth.session.activeBranchId ?? null,
      actorUserId: auth.session.userId,
      title: body.title,
      slug: body.slug,
      templateId: body.templateId ?? null,
      idempotencyKey,
      primaryLocale: null,
      brandName: body.title,
    });
    return successResponse(
      {
        success: true,
        site: {
          id: result.site.id,
          title: result.site.title,
          slug: result.site.slug,
          status: result.site.status,
        },
        homePage: {
          id: result.homePage.id,
          title: result.homePage.title,
          slug: result.homePage.slug,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Error provisioning CMS site:", error);
    return provisioningProblem(error, request.nextUrl.pathname);
  }
}
