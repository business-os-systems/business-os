import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession } from "@/lib/session-helper";
import { problemResponse } from "@/lib/problem-response";
import { listInstalledApps, type InstalledAppDto } from "@/services/installed-apps.service";

function toInstalledAppResponse(app: InstalledAppDto) {
  return {
    id: app.id,
    appId: app.appId,
    name: app.name,
    title: app.title,
    code: app.code,
    description: app.description,
    href: app.href,
    iconName: app.iconName,
    permission: app.permission,
    version: app.version,
    isEnabled: app.isEnabled,
    installedAt: app.installedAt,
  };
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedSession(request, { requireOrganization: true });
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const apps = (await listInstalledApps(auth.session.organizationId)).map(
      toInstalledAppResponse
    );

    return NextResponse.json(
      { organizationId: auth.session.organizationId, apps, installedApps: apps },
      { status: 200 }
    );
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
