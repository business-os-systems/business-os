import { NextResponse } from "next/server";
import { prisma } from "@suite/db";
import { z } from "zod";

const ParamsSchema = z.object({
  orgId: z.string().min(1),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const rawParams = await params;
    const parsed = ParamsSchema.safeParse(rawParams);

    if (!parsed.success) {
      return NextResponse.json(
        {
          type: "about:blank",
          title: "Invalid Organization Identifier",
          status: 400,
          code: "VALIDATION_ERROR",
          detail: parsed.error.issues[0]?.message ?? "Invalid organization ID.",
        },
        { status: 400 }
      );
    }

    const { orgId } = parsed.data;

    // Fetch dynamic entitlements from PostgreSQL
    const dbRecords = await prisma.installedApp.findMany({
      where: {
        organizationId: orgId,
        isEnabled: true,
      },
      orderBy: {
        installedAt: "asc",
      },
    });

    const installed = dbRecords.map((record) => {
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

    return NextResponse.json(
      {
        organizationId: orgId,
        apps: installed,
        installedApps: installed,
      },
      { status: 200 }
    );
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
