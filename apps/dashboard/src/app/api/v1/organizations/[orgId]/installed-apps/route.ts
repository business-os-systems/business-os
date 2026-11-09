import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { problemResponse, successResponse, zodProblemResponse } from "@/lib/api-response";
import { listInstalledApps, type InstalledAppDto } from "@/services/installed-apps.service";

const ParamsSchema = z.object({
  orgId: z.string().trim().min(1),
});

function notFoundProblem(): NextResponse {
  return problemResponse({
    status: 404,
    code: "NOT_FOUND",
    title: "Organization Not Found",
    detail: "The requested organization is not available to this session.",
  });
}

function internalProblem(error: unknown): NextResponse {
  console.error("Installed apps query failed:", error);
  return problemResponse({
    status: 500,
    code: "INTERNAL_SERVER_ERROR",
    title: "Installed Apps Query Failed",
    detail: "An unexpected error occurred while retrieving installed apps.",
  });
}

function toOrganizationAppResponse(app: InstalledAppDto) {
  return {
    id: app.id,
    appId: app.appId,
    name: app.name,
    title: app.title,
    code: app.code,
    description: app.description,
    href: app.href,
    iconName: app.iconName,
    version: app.version,
    isEnabled: app.isEnabled,
    installedAt: app.installedAt,
  };
}

/**
 * Installed applications for the caller's own organization. The path identifier
 * is validated against the authenticated session so a crafted orgId cannot read
 * another tenant's entitlements (CWE-639, P17); the query is scoped to the
 * session organization, never to the URL.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
): Promise<NextResponse> {
  const authResult = await getAuthenticatedSession(request, {
    requireOrganization: true,
  });
  if (!authResult.ok) {
    return authResult.response;
  }

  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return zodProblemResponse(parsed.error, {
      status: 400,
      code: "VALIDATION_FAILED",
      title: "Invalid Organization Identifier",
      detail: "The organization identifier in the path is invalid.",
    });
  }

  const { organizationId } = authResult.session;
  if (parsed.data.orgId !== organizationId) {
    return notFoundProblem();
  }

  try {
    const apps = (await listInstalledApps(organizationId)).map(toOrganizationAppResponse);
    return successResponse({ organizationId, apps, installedApps: apps });
  } catch (error) {
    return internalProblem(error);
  }
}
