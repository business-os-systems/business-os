import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, type Prisma } from "@suite/db";
import { listTenantCatalogSections } from "../../src/services/cms/catalog-section.service.js";

const enabled = Boolean(process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL);
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ORG_A = "org_wt350_cat_a_" + RUN;
const ORG_B = "org_wt350_cat_b_" + RUN;
const SLUG_PREFIX = "wt350-cat-" + RUN;

function definition(headline: string) {
  return {
    schemaVersion: "2026-03",
    block: { id: "blk_catalog", type: "hero", props: { headline } },
  };
}

async function cleanup(): Promise<void> {
  await prisma.cmsCatalogItemVersion.deleteMany({
    where: { item: { slug: { startsWith: SLUG_PREFIX } } },
  });
  await prisma.cmsCatalogItem.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
}

interface ItemInput {
  readonly slug: string;
  readonly name: string;
  readonly status?: "DRAFT" | "ACTIVE" | "DISABLED";
  readonly scope?: "GLOBAL" | "TENANT";
  readonly organizationId?: string | null;
  readonly targeting?: Prisma.InputJsonValue;
  readonly industries?: string[];
  readonly currentVersion?: number;
  readonly definition?: Prisma.InputJsonValue;
}

function createItem(input: ItemInput) {
  const scope = input.scope ?? "GLOBAL";
  return prisma.cmsCatalogItem.create({
    data: {
      kind: "SECTION",
      scope,
      organizationId: input.organizationId === undefined ? null : input.organizationId,
      name: input.name,
      slug: SLUG_PREFIX + "-" + input.slug,
      category: input.industries?.[0] ?? "hospitality",
      industries: input.industries ?? [],
      definition: input.definition ?? definition(input.name),
      status: input.status ?? "ACTIVE",
      targeting: input.targeting ?? {},
      currentVersion: input.currentVersion ?? 1,
      createdBy: "usr_catalog",
      updatedBy: "usr_catalog",
    },
  });
}

beforeAll(async () => {
  if (!enabled) return;
  await cleanup();
  await prisma.organization.create({
    data: { id: ORG_A, name: "Catalog A", slug: "wt350-cat-a-" + RUN, metadata: { industries: ["hospitality"] } },
  });
  await prisma.organization.create({
    data: { id: ORG_B, name: "Catalog B", slug: "wt350-cat-b-" + RUN, metadata: { industries: ["retail"] } },
  });
});

afterAll(async () => {
  if (!enabled) return;
  await cleanup();
  await prisma.$disconnect();
});

describe.skipIf(!enabled)("Tenant-visible section catalog (FR-008, FR-022)", () => {
  it("lists active global and own-tenant sections resolved for this tenant", async () => {
    await createItem({ slug: "global", name: "Global hero" });
    await createItem({ slug: "allow-a", name: "Allowed for A", targeting: { orgAllowlist: [ORG_A] } });
    await createItem({ slug: "allow-b", name: "Allowed for B", targeting: { orgAllowlist: [ORG_B] } });
    await createItem({ slug: "deny-a", name: "Denied for A", targeting: { orgDenylist: [ORG_A] } });
    await createItem({ slug: "draft", name: "Draft section", status: "DRAFT" });
    await createItem({ slug: "disabled", name: "Disabled section", status: "DISABLED" });
    await createItem({ slug: "industry-a", name: "Hospitality section", targeting: { industries: ["hospitality"] } });
    await createItem({ slug: "industry-b", name: "Retail only", targeting: { industries: ["retail"] } });
    await createItem({ slug: "tenant-a", name: "Tenant A section", scope: "TENANT", organizationId: ORG_A });
    await createItem({ slug: "tenant-b", name: "Tenant B section", scope: "TENANT", organizationId: ORG_B });
    await createItem({ slug: "unpublished", name: "Unpublished version", currentVersion: 0 });
    await createItem({
      slug: "broken",
      name: "Broken definition",
      definition: { schemaVersion: "2026-03", block: { id: "x", type: "unknown", props: {} } },
    });

    const sections = await listTenantCatalogSections({ organizationId: ORG_A, limit: 100 });
    const names = sections.map((section) => section.name);

    expect(names).toContain("Global hero");
    expect(names).toContain("Allowed for A");
    expect(names).toContain("Hospitality section");
    expect(names).toContain("Tenant A section");
    expect(names).not.toContain("Allowed for B");
    expect(names).not.toContain("Denied for A");
    expect(names).not.toContain("Draft section");
    expect(names).not.toContain("Disabled section");
    expect(names).not.toContain("Retail only");
    expect(names).not.toContain("Tenant B section");
    expect(names).not.toContain("Unpublished version");
    expect(names).not.toContain("Broken definition");
    expect(sections.every((section) => section.currentVersion > 0)).toBe(true);
    expect(sections.every((section) => section.definition.block.type === "hero")).toBe(true);
  });

  it("resolves a different tenant against the same catalog", async () => {
    const sections = await listTenantCatalogSections({ organizationId: ORG_B, limit: 100 });
    const names = sections.map((section) => section.name);
    expect(names).toContain("Global hero");
    expect(names).toContain("Allowed for B");
    expect(names).toContain("Retail only");
    expect(names).toContain("Tenant B section");
    expect(names).not.toContain("Allowed for A");
    expect(names).not.toContain("Hospitality section");
    expect(names).not.toContain("Tenant A section");
  });

  it("honours the declared limit and stable category order", async () => {
    const sections = await listTenantCatalogSections({ organizationId: ORG_A, limit: 2 });
    expect(sections).toHaveLength(2);
    const categories = sections.map((section) => section.category);
    expect([...categories].sort()).toEqual(categories);
  });
});
