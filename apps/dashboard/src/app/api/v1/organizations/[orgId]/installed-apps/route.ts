import { NextRequest, NextResponse } from "next/server";
import { prisma, type InstalledApp } from "@suite/db";
import { z } from "zod";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { problemResponse, successResponse, zodProblemResponse } from "@/lib/api-response";

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

function toInstalledAppPayload(record: InstalledApp) {
  const settings = (record.settings as Record<string, unknown>) || {};
  return {
    id: record.id,
    appId: record.appId,
    name: (settings.name as string) || record.appId,
    title: (settings.title as string) || (settings.name as string) || record.appId,
    code: (settings.code as string) || record.appId,
    description: (settings.description as string) || "",
    href: (settings.href as string) || `/${record.appId}`,
    iconName: (settings.iconName as string) || record.appId,
    version: record.version,
    isEnabled: record.isEnabled,
    installedAt: record.installedAt.toISOString(),
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
    const dbRecords = await prisma.installedApp.findMany({
      where: {
        organizationId,
        isEnabled: true,
      },
      orderBy: {
        installedAt: "asc",
      },
    });

    const apps = dbRecords.map(toInstalledAppPayload);
    return successResponse({ organizationId, apps, installedApps: apps });
  } catch (error) {
    return internalProblem(error);
  }
}
