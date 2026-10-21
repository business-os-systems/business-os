import { NextResponse } from "next/server";
import { prisma, type InstalledApp } from "@suite/db";
import { resolveTenantContext } from "@/lib/tenant-context";
import { problemResponse } from "@/lib/problem-response";

export async function GET(request: Request) {
  try {
    const tenantContext = await resolveTenantContext(request);
    if (!tenantContext.ok) {
      return tenantContext.response;
    }

    const orgId = tenantContext.organizationId;

    const dbRecords = await prisma.installedApp.findMany({
      where: {
        organizationId: orgId,
        isEnabled: true,
      },
      orderBy: {
        installedAt: "asc",
      },
    });

    const apps = dbRecords.map((record: InstalledApp) => {
      const settings = (record.settings as Record<string, unknown>) || {};
      const title =
        (settings.title as string) ||
        (settings.name as string) ||
        record.appId;
      return {
        id: record.id,
        appId: record.appId,
        name: (settings.name as string) || title,
        title,
        code: (settings.code as string) || record.appId,
        description: (settings.description as string) || "",
        href: (settings.href as string) || `/${record.appId}`,
        iconName: (settings.iconName as string) || record.appId,
        permission: (settings.permission as string) || `${record.appId}:read`,
        version: record.version,
        isEnabled: record.isEnabled,
        installedAt: record.installedAt.toISOString(),
      };
    });


    return NextResponse.json({ organizationId: orgId, apps, installedApps: apps }, { status: 200 });
  } catch (error) {
    console.error("Error retrieving installed apps:", error);
    return problemResponse({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      title: "Installed Apps Query Failed",
      detail: "An unexpected error occurred while retrieving installed apps.",
    });
  }
}
