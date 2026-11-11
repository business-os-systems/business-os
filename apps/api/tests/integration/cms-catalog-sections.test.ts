import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, withTenantContext, type Prisma } from "@suite/db";
import { readPublishedDefinitions } from "@suite/website-builder/services";
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
  readonly publishedDefinition?: Prisma.InputJsonValue;
  readonly writePublishedVersion?: boolean;
}

function buildItemData(input: ItemInput): Prisma.CmsCatalogItemCreateInput {
  const industries = input.industries ?? [];
  return {
    kind: "SECTION",
    scope: input.scope ?? "GLOBAL",
    organizationId: input.organizationId === undefined ? null : input.organizationId,
    name: input.name,
    slug: SLUG_PREFIX + "-" + input.slug,
    category: input.industries?.[0] ?? "hospitality",
    industries,
    definition: input.definition ?? definition(input.name),
    status: input.status ?? "ACTIVE",
    targeting: input.targeting ?? {},
    currentVersion: input.currentVersion ?? 1,
    createdBy: "usr_catalog",
    updatedBy: "usr_catalog",
  };
}

function writePublishedVersion(input: ItemInput, itemId: string): Promise<unknown> {
  return prisma.cmsCatalogItemVersion.create({
    data: {
      itemId,
      version: input.currentVersion ?? 1,
      definition: input.publishedDefinition ?? input.definition ?? definition(input.name),
      status: "ACTIVE",
      publishedAt: new Date(),
      publishedBy: "usr_catalog",
      createdBy: "usr_catalog",
    },
  });
}

/**
 * Creates a catalog item the way the admin service does: the item row carries
 * the working draft and currentVersion > 0 always has an immutable published
 * version row behind it.
 */
async function createItem(input: ItemInput) {
  const item = await prisma.cmsCatalogItem.create({ data: buildItemData(input) });
  if ((input.currentVersion ?? 1) > 0 && input.writePublishedVersion !== false) {
    await writePublishedVersion(input, item.id);
  }
  return item;
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
  beforeAll(async () => {
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
  });

  it("lists active global and own-tenant sections resolved for this tenant", async () => {
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

describe.skipIf(!enabled)("Unpublished catalog edits stay invisible (FR-012)", () => {
  it("hides an unpublished edit of an active section", async () => {
    const item = await createItem({
      slug: "draft-edit",
      name: "Edited section",
      publishedDefinition: definition("Published headline"),
    });
    await prisma.cmsCatalogItem.update({
      where: { id: item.id },
      data: { definition: definition("Unpublished headline"), draftVersion: 2 },
    });

    const sections = await listTenantCatalogSections({ organizationId: ORG_A, limit: 100 });
    const section = sections.find((candidate) => candidate.id === item.id);

    expect(section?.definition.block.props).toMatchObject({ headline: "Published headline" });
    expect(section?.currentVersion).toBe(1);
  });

  it("omits an active section that has no published version row", async () => {
    const item = await createItem({
      slug: "missing-version",
      name: "Unbacked section",
      writePublishedVersion: false,
    });

    const sections = await listTenantCatalogSections({ organizationId: ORG_A, limit: 100 });

    expect(sections.some((section) => section.id === item.id)).toBe(false);
  });

  it("resolves no definitions when there are no rows to read", async () => {
    const definitions = await withTenantContext(ORG_A, (tx) => readPublishedDefinitions(tx, []));

    expect(definitions.size).toBe(0);
  });
});

describe.skipIf(!enabled)("Publishing swaps the visible definition (FR-005)", () => {
  it("serves the new definition once the draft is published and keeps the old version", async () => {
    const item = await createItem({
      slug: "publish-edit",
      name: "Publishable section",
      publishedDefinition: definition("First headline"),
      definition: definition("Second headline"),
    });
    await prisma.$transaction([
      prisma.cmsCatalogItemVersion.create({
        data: {
          itemId: item.id,
          version: 2,
          definition: definition("Second headline"),
          status: "ACTIVE",
          publishedAt: new Date(),
          publishedBy: "usr_catalog",
          createdBy: "usr_catalog",
        },
      }),
      prisma.cmsCatalogItem.update({
        where: { id: item.id },
        data: { currentVersion: 2, draftVersion: null },
      }),
    ]);

    const sections = await listTenantCatalogSections({ organizationId: ORG_A, limit: 100 });
    const section = sections.find((candidate) => candidate.id === item.id);
    const versions = await prisma.cmsCatalogItemVersion.findMany({
      where: { itemId: item.id },
      orderBy: { version: "asc" },
      select: { version: true },
    });

    expect(section?.definition.block.props).toMatchObject({ headline: "Second headline" });
    expect(section?.currentVersion).toBe(2);
    expect(versions.map((version) => version.version)).toEqual([1, 2]);
  });
});
