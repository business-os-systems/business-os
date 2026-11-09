import { prisma } from "@suite/db";

const DEFAULT_TEMPLATE_BADGE = "Starter";

export interface CmsTemplateBlueprintDto {
  readonly id: string;
  readonly title: string;
  readonly desc: string;
  readonly badge: string;
  readonly category: string;
}

function readBlueprintRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function readBlueprintString(blueprint: Record<string, unknown>, key: string): string | undefined {
  const value = blueprint[key];
  return typeof value === "string" ? value : undefined;
}

export async function listStarterTemplates(): Promise<CmsTemplateBlueprintDto[]> {
  const templates = await prisma.cmsTemplate.findMany({
    where: { organizationId: null },
    orderBy: { createdAt: "asc" },
  });

  return templates.map((template) => {
    const blueprint = readBlueprintRecord(template.blueprintJson);
    return {
      id: readBlueprintString(blueprint, "id") ?? template.id,
      title: readBlueprintString(blueprint, "title") ?? template.name,
      desc: readBlueprintString(blueprint, "description") ?? "",
      badge: readBlueprintString(blueprint, "badge") ?? DEFAULT_TEMPLATE_BADGE,
      category: template.category,
    };
  });
}
