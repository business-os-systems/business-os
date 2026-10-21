import { NextResponse } from "next/server";
import { prisma, type CmsTemplate } from "@suite/db";

export interface TemplateBlueprintMetadata {
  id: string;
  title: string;
  desc: string;
  badge: string;
  category: string;
}

export async function GET() {
  try {
    const templates = await prisma.cmsTemplate.findMany({
      where: {
        organizationId: null, // Global platform starter templates
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const mapped: TemplateBlueprintMetadata[] = templates.map((tpl: CmsTemplate) => {
      const blueprint = (tpl.blueprintJson as Record<string, unknown>) || {};
      return {
        id: (blueprint.id as string) || tpl.id,
        title: (blueprint.title as string) || tpl.name,
        desc: (blueprint.description as string) || "",
        badge: (blueprint.badge as string) || "Starter",
        category: tpl.category,
      };
    });

    return NextResponse.json({ templates: mapped }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load starter templates" },
      { status: 500 }
    );
  }
}
