import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@suite/db";
import { NotFoundError } from "@suite/core/errors";
import { createSite, getSite, listSites } from "../../src/services/cms/site-service.js";
import {
  archivePage,
  createPage,
  deletePage,
  duplicatePage,
  getPage,
  listPages,
  listRedirects,
  reorderPage,
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

async function createOperationSite(slug: string) {
  return createSite(createInput({ slug, idempotencyKey: "idem-ops-" + slug }));
}

describe.skipIf(!enabled)("CMS page reorder (FR-020, FR-080)", () => {
  it("moves a page among its siblings and audits the move", async () => {
    const created = await createOperationSite("reorder-" + RUN);
    const about = await createPage({
      organizationId: ORG_A,
      siteId: created.site.id,
      actorUserId: ACTOR,
      body: { title: "About", path: "about" },
    });
    const contact = await createPage({
      organizationId: ORG_A,
      siteId: created.site.id,
      actorUserId: ACTOR,
      body: { title: "Contact", path: "contact" },
    });
    const moved = await reorderPage({
      organizationId: ORG_A,
      pageId: contact.id,
      actorUserId: ACTOR,
      body: { direction: "up", expectedRevision: contact.revision },
    });

    expect(moved.orderIndex).toBe(about.orderIndex);
    const pages = await listPages({ organizationId: ORG_A, siteId: created.site.id, limit: 100 });
    const ordered = pages.items.map((page) => page.title);
    expect(ordered.indexOf("Contact")).toBeLessThan(ordered.indexOf("About"));
    expect(moved.revision).toBe(contact.revision + 1);

    const audit = await prisma.cmsAuditTrail.findFirst({
      where: {
        organizationId: ORG_A,
        siteId: created.site.id,
        entityId: contact.id,
        action: "PAGE_MOVED",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.actorUserId).toBe(ACTOR);
    expect(audit?.changesJson).toMatchObject({ reason: "REORDER", direction: "up" });
  });
});

describe.skipIf(!enabled)("CMS page reorder guards (FR-020, CT-3)", () => {
  it("refuses a reorder based on a stale revision", async () => {
    const created = await createOperationSite("reorder-stale-" + RUN);
    const first = await createPage({
      organizationId: ORG_A,
      siteId: created.site.id,
      actorUserId: ACTOR,
      body: { title: "One", path: "one" },
    });
    await createPage({
      organizationId: ORG_A,
      siteId: created.site.id,
      actorUserId: ACTOR,
      body: { title: "Two", path: "two" },
    });
    await expect(
      reorderPage({
        organizationId: ORG_A,
        pageId: first.id,
        actorUserId: ACTOR,
        body: { direction: "down", expectedRevision: first.revision + 5 },
      })
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
});

describe.skipIf(!enabled)("CMS page duplicate (FR-020, FR-080)", () => {
  it("duplicates a page with copied content beside its source", async () => {
    const created = await createOperationSite("duplicate-" + RUN);
    const source = await createPage({
      organizationId: ORG_A,
      siteId: created.site.id,
      actorUserId: ACTOR,
      body: { title: "Services", path: "services" },
    });
    await prisma.cmsPageContent.update({
      where: { pageId_organizationId: { pageId: source.id, organizationId: ORG_A } },
      data: {
        draftAst: { version: 1, schemaVersion: "2026-03", meta: { title: "Services" }, sections: [] },
      },
    });
    const copy = await duplicatePage({
      organizationId: ORG_A,
      pageId: source.id,
      actorUserId: ACTOR,
    });

    expect(copy.id).not.toBe(source.id);
    expect(copy.title).toBe("Services (copy)");
    expect(copy.path).toBe("/services-copy");
    expect(copy.isHomePage).toBe(false);
    expect(copy.status).toBe("DRAFT");
    expect(copy.orderIndex).toBe(source.orderIndex + 1);
    const copyContent = await prisma.cmsPageContent.findFirstOrThrow({
      where: { pageId: copy.id, organizationId: ORG_A },
    });
    expect(copyContent.draftAst).toMatchObject({ meta: { title: "Services" } });
    const audit = await prisma.cmsAuditTrail.findFirst({
      where: { organizationId: ORG_A, siteId: created.site.id, entityId: copy.id },
    });
    expect(audit?.action).toBe("PAGE_CREATED");
    expect(audit?.changesJson).toMatchObject({ sourcePageId: source.id });
  });
});

describe.skipIf(!enabled)("CMS page archive (FR-020)", () => {
  it("archives a page without deleting it and audits the removal", async () => {
    const created = await createOperationSite("archive-" + RUN);
    const legal = await createPage({
      organizationId: ORG_A,
      siteId: created.site.id,
      actorUserId: ACTOR,
      body: { title: "Legal", path: "legal" },
    });
    const archived = await archivePage({
      organizationId: ORG_A,
      pageId: legal.id,
      actorUserId: ACTOR,
      body: { expectedRevision: legal.revision },
    });

    expect(archived.status).toBe("ARCHIVED");
    expect(archived.revision).toBe(legal.revision + 1);
    expect(await prisma.cmsPage.count({ where: { id: legal.id, organizationId: ORG_A } })).toBe(1);
    const audit = await prisma.cmsAuditTrail.findFirst({
      where: { organizationId: ORG_A, siteId: created.site.id, entityId: legal.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.action).toBe("PAGE_ARCHIVED");
    expect(audit?.changesJson).toMatchObject({ archived: true, previousStatus: "DRAFT" });
  });
});

describe.skipIf(!enabled)("CMS page archive guards (FR-020)", () => {
  it("refuses the home page and a parent with live children", async () => {
    const created = await createOperationSite("archive-guards-" + RUN);
    await expect(
      archivePage({
        organizationId: ORG_A,
        pageId: created.homePage.id,
        actorUserId: ACTOR,
        body: { expectedRevision: 1 },
      })
    ).rejects.toMatchObject({ code: "PAGE_TREE_PROTECTED" });

    const parent = await createPage({
      organizationId: ORG_A,
      siteId: created.site.id,
      actorUserId: ACTOR,
      body: { title: "Rooms", path: "rooms" },
    });
    await createPage({
      organizationId: ORG_A,
      siteId: created.site.id,
      actorUserId: ACTOR,
      body: { title: "Suites", path: "rooms/suites", parentId: parent.id },
    });
    await expect(
      archivePage({
        organizationId: ORG_A,
        pageId: parent.id,
        actorUserId: ACTOR,
        body: { expectedRevision: parent.revision },
      })
    ).rejects.toMatchObject({ code: "PAGE_TREE_PROTECTED" });
  });
});

describe.skipIf(!enabled)("CMS page operation isolation (FR-020)", () => {
  it("keeps another tenant out of every page operation", async () => {
    const created = await createOperationSite("ops-isolation-" + RUN);
    const page = await createPage({
      organizationId: ORG_A,
      siteId: created.site.id,
      actorUserId: ACTOR,
      body: { title: "Private", path: "private" },
    });
    await expect(
      reorderPage({
        organizationId: ORG_B,
        pageId: page.id,
        actorUserId: ACTOR,
        body: { direction: "up", expectedRevision: page.revision },
      })
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      duplicatePage({ organizationId: ORG_B, pageId: page.id, actorUserId: ACTOR })
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      archivePage({
        organizationId: ORG_B,
        pageId: page.id,
        actorUserId: ACTOR,
        body: { expectedRevision: page.revision },
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe.skipIf(!enabled)("CMS redirects destination (FR-082)", () => {
  it("lists the permanent redirect a published page move created", async () => {
    const created = await createSite(
      createInput({ slug: "redirects-" + RUN, idempotencyKey: "idem-redirects-" + RUN })
    );
    const page = await createPage({
      organizationId: ORG_A,
      siteId: created.site.id,
      actorUserId: ACTOR,
      body: { title: "Rates", path: "rates" },
    });
    await prisma.cmsPage.update({
      where: { id_organizationId: { id: page.id, organizationId: ORG_A } },
      data: { status: "PUBLISHED" },
    });
    await updatePage({
      organizationId: ORG_A,
      pageId: page.id,
      actorUserId: ACTOR,
      body: { path: "/pricing", expectedRevision: page.revision },
    });

    const redirects = await listRedirects({
      organizationId: ORG_A,
      siteId: created.site.id,
      limit: 20,
    });
    expect(redirects.items).toHaveLength(1);
    expect(redirects.items[0]).toMatchObject({
      sourcePath: "/rates",
      targetPath: "/pricing",
      type: "PERMANENT",
    });
    expect(redirects.nextCursor).toBeNull();
    await expect(
      listRedirects({ organizationId: ORG_B, siteId: created.site.id, limit: 20 })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe.skipIf(!enabled)("CMS page archive repeat guard (FR-020)", () => {
  it("refuses to archive an already archived page", async () => {
    const created = await createOperationSite("archive-twice-" + RUN);
    const page = await createPage({
      organizationId: ORG_A,
      siteId: created.site.id,
      actorUserId: ACTOR,
      body: { title: "Twice", path: "twice" },
    });
    const archived = await archivePage({
      organizationId: ORG_A,
      pageId: page.id,
      actorUserId: ACTOR,
      body: { expectedRevision: page.revision },
    });
    await expect(
      archivePage({
        organizationId: ORG_A,
        pageId: page.id,
        actorUserId: ACTOR,
        body: { expectedRevision: archived.revision },
      })
    ).rejects.toMatchObject({ code: "PAGE_TREE_PROTECTED" });
  });
});

describe.skipIf(!enabled)("CMS last live page guard (FR-020)", () => {
  it("refuses to archive the only live page when it is not home", async () => {
    const siteId = "site_only_live_" + RUN;
    await prisma.cmsSite.create({
      data: {
        id: siteId,
        organizationId: ORG_A,
        title: "Only live",
        slug: "only-live-" + RUN,
        status: "DRAFT",
        timezone: "UTC",
      },
    });
    const onlyPage = await prisma.cmsPage.create({
      data: {
        id: "page_only_live_" + RUN,
        organizationId: ORG_A,
        siteId,
        title: "Only",
        slug: "/only",
        orderIndex: 0,
        isHomePage: false,
        revision: 1,
        status: "DRAFT",
      },
    });
    await expect(
      archivePage({
        organizationId: ORG_A,
        pageId: onlyPage.id,
        actorUserId: ACTOR,
        body: { expectedRevision: 1 },
      })
    ).rejects.toMatchObject({ code: "PAGE_TREE_PROTECTED" });
  });
});

describe.skipIf(!enabled)("CMS duplicate path exhaustion (FR-020)", () => {
  it("refuses when every copy address is taken", async () => {
    const created = await createOperationSite("dup-exhaust-" + RUN);
    const source = await createPage({
      organizationId: ORG_A,
      siteId: created.site.id,
      actorUserId: ACTOR,
      body: { title: "Base", path: "base" },
    });
    await prisma.cmsPage.createMany({
      data: Array.from({ length: 50 }, (_, index) => ({
        id: "page_dup_" + RUN + "_" + String(index),
        organizationId: ORG_A,
        siteId: created.site.id,
        title: "Copy " + String(index),
        slug: index === 0 ? "/base-copy" : "/base-copy-" + String(index + 1),
        orderIndex: 10 + index,
        isHomePage: false,
        revision: 1,
        status: "DRAFT",
      })),
    });
    await expect(
      duplicatePage({ organizationId: ORG_A, pageId: source.id, actorUserId: ACTOR })
    ).rejects.toMatchObject({ code: "PAGE_PATH_CONFLICT" });
  });
});

describe.skipIf(!enabled)("CMS concurrent rename detection (CT-3)", () => {
  it("reports one winner and one version conflict for the same revision", async () => {
    const created = await createOperationSite("rename-race-" + RUN);
    const page = await createPage({
      organizationId: ORG_A,
      siteId: created.site.id,
      actorUserId: ACTOR,
      body: { title: "Race", path: "race" },
    });
    const results = await Promise.allSettled([
      updatePage({
        organizationId: ORG_A,
        pageId: page.id,
        actorUserId: ACTOR,
        body: { title: "Race A", expectedRevision: page.revision },
      }),
      updatePage({
        organizationId: ORG_A,
        pageId: page.id,
        actorUserId: ACTOR,
        body: { title: "Race B", expectedRevision: page.revision },
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : null).toMatchObject({
      code: "VERSION_CONFLICT",
    });
  });
});

describe.skipIf(!enabled)("CMS redirect cursor pagination (CT-5)", () => {
  it("pages redirects with a stable cursor and refuses a malformed one", async () => {
    const created = await createOperationSite("redirect-cursor-" + RUN);
    await prisma.cmsUrlRedirect.createMany({
      data: [
        {
          organizationId: ORG_A,
          siteId: created.site.id,
          sourcePath: "/old-one",
          targetUrl: "/one",
          type: "PERMANENT",
        },
        {
          organizationId: ORG_A,
          siteId: created.site.id,
          sourcePath: "/old-two",
          targetUrl: "/two",
          type: "PERMANENT",
        },
      ],
    });
    const first = await listRedirects({
      organizationId: ORG_A,
      siteId: created.site.id,
      limit: 1,
    });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = await listRedirects({
      organizationId: ORG_A,
      siteId: created.site.id,
      limit: 1,
      cursor: first.nextCursor ?? "",
    });
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.sourcePath).not.toBe(first.items[0]?.sourcePath);
    await expect(
      listRedirects({
        organizationId: ORG_A,
        siteId: created.site.id,
        limit: 1,
        cursor: "bad!",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});

describe.skipIf(!enabled)("CMS redirect cursor guards (CT-5)", () => {
  it("refuses a cursor with an unreadable or unexpected payload", async () => {
    const created = await createOperationSite("redirect-bad-cursor-" + RUN);
    // Valid cursor charset, unreadable JSON; then readable JSON with the wrong shape.
    await expect(
      listRedirects({
        organizationId: ORG_A,
        siteId: created.site.id,
        limit: 1,
        cursor: "bm90LWpzb24",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      listRedirects({
        organizationId: ORG_A,
        siteId: created.site.id,
        limit: 1,
        cursor: "e30",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
