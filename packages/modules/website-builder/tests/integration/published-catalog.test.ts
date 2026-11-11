import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, withTenantContext } from "@suite/db";
import { NotFoundError } from "@suite/core/errors";
import { provisionSiteFromTemplate } from "../../src/services/site-provisioning.js";
import {
  publishedDefinitionKey,
  readPublishedDefinitions,
} from "../../src/services/published-catalog.js";

const enabled = Boolean(process.env.DATABASE_URL);
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ORG = "org_wt368_" + RUN;
const TEMPLATE_SLUG = "wt368-template-" + RUN;
const ACTOR = "usr_wt368_actor";

const PUBLISHED_BLUEPRINT = {
  schemaVersion: "2026-03",
  pages: [
    {
      version: 1,
      schemaVersion: "2026-03",
      meta: { title: "Published home" },
      sections: [],
    },
  ],
};

const DRAFT_BLUEPRINT = {
  schemaVersion: "2026-03",
  pages: [
    {
      version: 1,
      schemaVersion: "2026-03",
      meta: { title: "Draft landing" },
      sections: [],
    },
  ],
};

async function cleanup(): Promise<void> {
  const sites = await prisma.cmsSite.findMany({
    where: { organizationId: ORG },
    select: { id: true },
  });
  const siteIds = sites.map((site) => site.id);
  await prisma.cmsAuditTrail.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsPageContent.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsPageVersion.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsPage.deleteMany({ where: { siteId: { in: siteIds } } });
  await prisma.cmsSite.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsCatalogItemVersion.deleteMany({
    where: { item: { slug: { startsWith: TEMPLATE_SLUG } } },
  });
  await prisma.cmsCatalogItem.deleteMany({ where: { slug: { startsWith: TEMPLATE_SLUG } } });
  await prisma.organization.deleteMany({ where: { id: ORG } });
}

function createTemplate(input: {
  readonly slug: string;
  readonly published: boolean;
}) {
  return prisma.cmsCatalogItem.create({
    data: {
      kind: "TEMPLATE",
      scope: "GLOBAL",
      organizationId: null,
      name: "WT-368 template",
      slug: TEMPLATE_SLUG + "-" + input.slug,
      category: "hospitality",
      industries: ["hospitality"],
      definition: DRAFT_BLUEPRINT,
      status: "ACTIVE",
      currentVersion: 1,
      draftVersion: 2,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    },
  });
}

function publishTemplateVersion(itemId: string) {
  return prisma.cmsCatalogItemVersion.create({
    data: {
      itemId,
      version: 1,
      definition: PUBLISHED_BLUEPRINT,
      status: "ACTIVE",
      publishedAt: new Date(),
      publishedBy: ACTOR,
      createdBy: ACTOR,
    },
  });
}

function provisionInput(templateId: string) {
  return {
    organizationId: ORG,
    branchId: null,
    actorUserId: ACTOR,
    idempotencyKey: "idem-wt368-" + RUN,
    title: "WT-368 site",
    slug: "wt368-site-" + RUN,
    templateId,
  };
}

let publishedTemplateId = "";

beforeAll(async () => {
  if (!enabled) return;
  await cleanup();
  await prisma.organization.create({
    data: { id: ORG, name: "WT-368 tenant", slug: "wt368-" + RUN },
  });
  const published = await createTemplate({ slug: "published", published: true });
  await publishTemplateVersion(published.id);
  publishedTemplateId = published.id;
});

afterAll(async () => {
  if (!enabled) return;
  await cleanup();
  await prisma.$disconnect();
});

describe.skipIf(!enabled)("Published catalog definitions (FR-012, FR-005)", () => {
  it("reads the immutable version row for the current version", async () => {
    const definitions = await withTenantContext(ORG, (tx) =>
      readPublishedDefinitions(tx, [{ id: publishedTemplateId, currentVersion: 1 }])
    );

    expect(definitions.get(publishedDefinitionKey(publishedTemplateId, 1))).toMatchObject({
      pages: [{ meta: { title: "Published home" } }],
    });
  });

  it("returns an empty map when there is nothing to read", async () => {
    const definitions = await withTenantContext(ORG, (tx) => readPublishedDefinitions(tx, []));

    expect(definitions.size).toBe(0);
  });

  it("provisions the home page from the published blueprint, not the working draft", async () => {
    const result = await provisionSiteFromTemplate(provisionInput(publishedTemplateId));

    expect(result.pages).toHaveLength(1);
    expect(result.homePage.title).toBe("Published home");
  });

  it("refuses a template whose published version row is missing", async () => {
    const unbacked = await createTemplate({ slug: "unbacked", published: false });

    await expect(
      provisionSiteFromTemplate({
        ...provisionInput(unbacked.id),
        idempotencyKey: "idem-wt368-unbacked-" + RUN,
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
