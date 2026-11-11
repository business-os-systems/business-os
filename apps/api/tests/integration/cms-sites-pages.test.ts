import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@suite/db";
import { NotFoundError } from "@suite/core/errors";
import { createSite, getSite, listSites } from "../../src/services/cms/site-service.js";
import {
  createPage,
  deletePage,
  getPage,
  listPages,
  updatePage,
} from "../../src/services/cms/page-service.js";

const enabled = Boolean(process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL);
const RUN = Date.now().toString(36);
const ORG_A = "org_wt349_a_" + RUN;
const ORG_B = "org_wt349_b_" + RUN;
const ACTOR = "usr_wt349_actor";
const TEMPLATE_SLUG = "wt349-template-" + RUN;
const BLUEPRINT = {
  schemaVersion: "2026-03",
  pages: [
    { version: 1, schemaVersion: "2026-03", meta: { title: "Home" }, sections: [] },
    { version: 1, schemaVersion: "2026-03", meta: { title: "About Us" }, sections: [] },
  ],
};

async function cleanup(): Promise<void> {
  const orgs = [ORG_A, ORG_B];
  await prisma.cmsAuditTrail.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.cmsPageContent.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.cmsPageVersion.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.cmsPage.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.cmsSite.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.cmsCatalogItemVersion.deleteMany({
    where: { item: { slug: { startsWith: TEMPLATE_SLUG } } },
  });
  await prisma.cmsCatalogItem.deleteMany({ where: { slug: { startsWith: TEMPLATE_SLUG } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
}

async function createTenant(id: string, label: string): Promise<void> {
  await prisma.organization.create({
    data: { id, name: "T-04 " + label, slug: "wt349-" + label + "-" + RUN },
  });
}

const DRAFT_BLUEPRINT = {
  schemaVersion: "2026-03",
  pages: [
    { version: 1, schemaVersion: "2026-03", meta: { title: "Draft landing" }, sections: [] },
  ],
};

/**
 * The item row carries the working draft and currentVersion names the
 * immutable published version row, exactly as the admin publish path writes it.
 */
async function createPublishedTemplate(slug = TEMPLATE_SLUG) {
  const item = await prisma.cmsCatalogItem.create({
    data: {
      kind: "TEMPLATE",
      scope: "GLOBAL",
      organizationId: null,
      name: "T-04 template",
      slug,
      category: "hospitality",
      industries: ["hospitality"],
      definition: BLUEPRINT,
      status: "ACTIVE",
      currentVersion: 1,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    },
  });
  await prisma.cmsCatalogItemVersion.create({
    data: {
      itemId: item.id,
      version: 1,
      definition: BLUEPRINT,
      status: "ACTIVE",
      publishedAt: new Date(),
      publishedBy: ACTOR,
      createdBy: ACTOR,
    },
  });
  return item;
}

function createInput(overrides: {
  organizationId?: string;
  slug: string;
  title?: string;
  templateId?: string | null;
  idempotencyKey: string;
}) {
  return {
    organizationId: overrides.organizationId ?? ORG_A,
    branchId: null,
    actorUserId: ACTOR,
    idempotencyKey: overrides.idempotencyKey,
    body: {
      title: overrides.title ?? "Riverview Bistro",
      slug: overrides.slug,
      templateId: overrides.templateId === undefined ? null : overrides.templateId,
    },
  };
}

let templateId = "";

beforeAll(async () => {
  if (!enabled) {
    return;
  }
  await cleanup();
  await createTenant(ORG_A, "a");
  await createTenant(ORG_B, "b");
  const template = await createPublishedTemplate();
  templateId = template.id;
});

afterAll(async () => {
  if (!enabled) {
    return;
  }
  await cleanup();
  await prisma.$disconnect();
});

describe.skipIf(!enabled)("CMS site creation", () => {
  it("creates a site from a published template with exactly one home page", async () => {
    const result = await createSite(
      createInput({ slug: "riverview-" + RUN, templateId, idempotencyKey: "idem-create-" + RUN })
    );
    expect(result.site.organizationId).toBe(ORG_A);
    expect(result.pageCount).toBe(2);
    expect(result.homePage.path).toBe("/");
    const pages = await listPages({ organizationId: ORG_A, siteId: result.site.id, limit: 100 });
    expect(pages.items).toHaveLength(2);
    expect(pages.items.filter((page) => page.isHomePage)).toHaveLength(1);
    expect(pages.items.map((page) => page.path).sort()).toEqual(["/", "/about-us"]);
    expect(
      await prisma.cmsPage.count({
        where: { organizationId: ORG_A, siteId: result.site.id, isHomePage: true },
      })
    ).toBe(1);
  });

  it("replays create-from-template for the same request id", async () => {
    const key = "idem-replay-" + RUN;
    const input = createInput({ slug: "replay-" + RUN, templateId, idempotencyKey: key });
    const first = await createSite(input);
    const second = await createSite(input);
    expect(second.site.id).toBe(first.site.id);
    expect(second.replayed).toBe(true);
    expect(await prisma.cmsSite.count({ where: { organizationId: ORG_A, idempotencyKey: key } })).toBe(1);
    expect(
      await prisma.cmsAuditTrail.count({
        where: { organizationId: ORG_A, siteId: first.site.id, action: "SITE_CREATED" },
      })
    ).toBe(1);
  });

  it("resolves concurrent replays of one request id to one site", async () => {
    const key = "idem-concurrent-" + RUN;
    const input = createInput({ slug: "concurrent-" + RUN, templateId, idempotencyKey: key });
    const [first, second] = await Promise.all([createSite(input), createSite(input)]);
    expect(second.site.id).toBe(first.site.id);
    expect(await prisma.cmsSite.count({ where: { organizationId: ORG_A, idempotencyKey: key } })).toBe(1);
  });

  it("refuses to reuse one request id for a different payload", async () => {
    const key = "idem-conflict-" + RUN;
    await createSite(createInput({ slug: "conflict-a-" + RUN, idempotencyKey: key }));
    await expect(
      createSite(createInput({ slug: "conflict-b-" + RUN, idempotencyKey: key }))
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
});

describe.skipIf(!enabled)("CMS tenant isolation", () => {
  it("reports another tenant's site and page ids as not found", async () => {
    const created = await createSite(
      createInput({ slug: "isolated-" + RUN, idempotencyKey: "idem-isolated-" + RUN })
    );
    expect(await getSite({ organizationId: ORG_B, siteId: created.site.id })).toBeNull();
    await expect(
      listPages({ organizationId: ORG_B, siteId: created.site.id, limit: 100 })
    ).rejects.toBeInstanceOf(NotFoundError);
    const pages = await listPages({ organizationId: ORG_A, siteId: created.site.id, limit: 100 });
    const pageId = pages.items[0]?.id ?? "";
    expect(await getPage({ organizationId: ORG_B, pageId })).toBeNull();
    await expect(
      updatePage({
        organizationId: ORG_B,
        pageId,
        actorUserId: ACTOR,
        body: { title: "Hijacked", expectedRevision: 1 },
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe.skipIf(!enabled)("CMS page mutations", () => {
  it("creates pages, rejects stale writes and audits the mutations", async () => {
    const created = await createSite(
      createInput({ slug: "pages-" + RUN, idempotencyKey: "idem-pages-" + RUN })
    );
    const page = await createPage({
      organizationId: ORG_A,
      siteId: created.site.id,
      actorUserId: ACTOR,
      body: { title: "Contact", path: "contact" },
    });
    expect(page.path).toBe("/contact");
    const renamed = await updatePage({
      organizationId: ORG_A,
      pageId: page.id,
      actorUserId: ACTOR,
      body: { title: "Talk to us", path: "/contact-us", expectedRevision: page.revision },
    });
    expect(renamed.path).toBe("/contact-us");
    expect(renamed.revision).toBe(page.revision + 1);
    await expect(
      updatePage({
        organizationId: ORG_A,
        pageId: page.id,
        actorUserId: ACTOR,
        body: { title: "Stale", expectedRevision: page.revision },
      })
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const actions = await prisma.cmsAuditTrail.findMany({
      where: { organizationId: ORG_A, siteId: created.site.id, entityId: page.id },
      orderBy: { createdAt: "asc" },
    });
    expect(actions.map((row) => row.action)).toEqual(["PAGE_CREATED", "PAGE_MOVED"]);
    expect(actions[0]?.actorUserId).toBe(ACTOR);
    await expect(
      deletePage({ organizationId: ORG_A, pageId: page.id, actorUserId: ACTOR })
    ).resolves.toEqual({ deleted: true });
  });

});

describe.skipIf(!enabled)("CMS page tree guards", () => {
  it("refuses to delete the home page and a second home page", async () => {
    const created = await createSite(
      createInput({ slug: "home-" + RUN, idempotencyKey: "idem-home-" + RUN })
    );
    await expect(
      deletePage({ organizationId: ORG_A, pageId: created.homePage.id, actorUserId: ACTOR })
    ).rejects.toMatchObject({ code: "PAGE_TREE_PROTECTED" });
    await expect(
      createPage({
        organizationId: ORG_A,
        siteId: created.site.id,
        actorUserId: ACTOR,
        body: { title: "Another home", path: "/", isHomePage: true },
      })
    ).rejects.toMatchObject({ code: "PAGE_PATH_CONFLICT" });
  });

  it("refuses a duplicate page address", async () => {
    const created = await createSite(
      createInput({ slug: "dupe-" + RUN, idempotencyKey: "idem-dupe-" + RUN })
    );
    const body = { title: "Offers", path: "/offers" };
    await createPage({ organizationId: ORG_A, siteId: created.site.id, actorUserId: ACTOR, body });
    await expect(
      createPage({ organizationId: ORG_A, siteId: created.site.id, actorUserId: ACTOR, body })
    ).rejects.toMatchObject({ code: "PAGE_PATH_CONFLICT" });
  });
});

describe.skipIf(!enabled)("CMS site pagination", () => {
  it("cursor-paginates the site list with a stable order", async () => {
    const first = await listSites({ organizationId: ORG_A, limit: 2 });
    expect(first.items.length).toBeLessThanOrEqual(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await listSites({
      organizationId: ORG_A,
      limit: 50,
      cursor: first.nextCursor ?? "",
    });
    const ids = [...first.items, ...second.items].map((site) => site.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe.skipIf(!enabled)("Template published version (FR-012, FR-005)", () => {
  it("provisions from the published template version, never an unpublished draft", async () => {
    await prisma.cmsCatalogItem.update({
      where: { id: templateId },
      data: { definition: DRAFT_BLUEPRINT, draftVersion: 2 },
    });

    const result = await createSite(
      createInput({ slug: "template-draft-" + RUN, templateId, idempotencyKey: "idem-draft-" + RUN })
    );
    const pages = await listPages({
      organizationId: ORG_A,
      siteId: result.site.id,
      limit: 100,
    });

    expect(result.pageCount).toBe(2);
    expect(pages.items.map((page) => page.path).sort()).toEqual(["/", "/about-us"]);
    expect(pages.items.some((page) => page.title === "Draft landing")).toBe(false);

    await prisma.cmsCatalogItem.update({
      where: { id: templateId },
      data: { definition: BLUEPRINT, draftVersion: null },
    });
  });

  it("refuses a template whose published version row is missing", async () => {
    const unbacked = await prisma.cmsCatalogItem.create({
      data: {
        kind: "TEMPLATE",
        scope: "GLOBAL",
        organizationId: null,
        name: "Unbacked template",
        slug: TEMPLATE_SLUG + "-unbacked",
        category: "hospitality",
        industries: ["hospitality"],
        definition: BLUEPRINT,
        status: "ACTIVE",
        currentVersion: 1,
        createdBy: ACTOR,
        updatedBy: ACTOR,
      },
    });

    await expect(
      createSite(
        createInput({
          slug: "template-unbacked-" + RUN,
          templateId: unbacked.id,
          idempotencyKey: "idem-unbacked-" + RUN,
        })
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
