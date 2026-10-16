import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@suite/db";
import { SESSION_COOKIE_NAME, verifySessionToken, decodeSessionPayload } from "@/lib/auth-constants";

export async function GET(request: Request) {
  try {
    let orgId = request.headers.get("x-tenant-id") || request.headers.get("x-organization-id");

    if (!orgId) {
      const cookieStore = await cookies();
      const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
      if (sessionToken) {
        const isValid = await verifySessionToken(sessionToken);
        if (isValid) {
          const payload = decodeSessionPayload(sessionToken);
          if (payload?.organizationId) {
            orgId = payload.organizationId;
          }
        }
      }
    }

    if (!orgId) {
      return NextResponse.json(
        {
          type: "about:blank",
          code: "UNAUTHORIZED",
          title: "Missing Tenant Context",
          status: 401,
          detail: "Active tenant session is required to retrieve installed apps.",
        },
        { status: 401 }
      );
    }

    const dbRecords = await prisma.installedApp.findMany({
      where: {
        organizationId: orgId,
        isEnabled: true,
      },
      orderBy: {
        installedAt: "asc",
      },
    });

    const apps = dbRecords.map((record) => {
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
    });

    return NextResponse.json({ organizationId: orgId, apps, installedApps: apps }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        type: "about:blank",
        title: "Installed Apps Query Failed",
        status: 500,
        code: "INTERNAL_SERVER_ERROR",
        detail: error instanceof Error ? error.message : "Internal server error.",
      },
      { status: 500 }
    );
  }
}
