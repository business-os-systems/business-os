import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@suite/db";
import { createPage, updatePage } from "../../src/services/cms/page-service.js";
import { readPublishedSitemap } from "../../src/services/storefront/storefront-read-service.js";

const enabled = Boolean(process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL);
const RUN = Date.now().toString(36);
const ORG = "org_wt355_redirect_" + RUN;
const ACTOR = "usr_wt355_redirect";
const HOST = "wt355-redirect-" + RUN + ".businessos.app";
const SITE_SLUG = "wt355-redirect-" + RUN;
const RENAME_A = "/rename-a";
const RENAMED_A = "/rename-a-new";
const RENAME_B = "/rename-b";
const RENAMED_B = "/rename-b-new";
const RENAME_C = "/rename-c";
const OCCUPIED_C = "/occupied-c";

let siteId = "";

async function cleanup(): Promise<void> {
  await prisma.cmsUrlRedirect.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsAuditTrail.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsPageContent.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsPage.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsDomain.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsSite.deleteMany({ where: { organizationId: ORG } });
  await prisma.organization.deleteMany({ where: { id: ORG } });
}

async function seedPage(input: {
  readonly path: string;
  readonly status: "PUBLISHED" | "DRAFT";
}): Promise<string> {
  const page = await createPage({
    organizationId: ORG,
    siteId,
    actorUserId: ACTOR,
    body: { title: "Page " + input.path, path: input.path },
  });
  if (input.status === "DRAFT") {
    return page.id;
  }
  await prisma.cmsPage.update({
    where: { id: page.id },
    data: { status: "PUBLISHED" },
  });
  await prisma.cmsPageContent.update({
    where: { pageId: page.id },
    data: {
      publishedAst: {
        version: 1,
        schemaVersion: "2026-03",
        meta: { title: "SEO " + input.path },
        sections: [],
      },
      publishedAt: new Date(),
    },
  });
  return page.id;
}

async function seedRedirect(sourcePath: string, targetUrl: string): Promise<void> {
  await prisma.cmsUrlRedirect.create({
    data: { organizationId: ORG, siteId, sourcePath, targetUrl },
  });
}

async function rename(pageId: string, path: string): Promise<void> {
  await updatePage({
    organizationId: ORG,
    pageId,
    actorUserId: ACTOR,
    body: { path, expectedRevision: 1 },
  });
}

async function findRedirect(sourcePath: string) {
  return prisma.cmsUrlRedirect.findFirst({
    where: { organizationId: ORG, siteId, sourcePath },
  });
}

async function countRedirects(sourcePath: string): Promise<number> {
  return prisma.cmsUrlRedirect.count({
    where: { organizationId: ORG, siteId, sourcePath },
  });
}

beforeAll(async () => {
  if (!enabled) {
    return;
  }
  await cleanup();
  await prisma.organization.create({
    data: { id: ORG, name: "WT 355 redirects", slug: SITE_SLUG },
  });
  const site = await prisma.cmsSite.create({
    data: {
      organizationId: ORG,
      title: "Redirect Bistro",
      slug: SITE_SLUG,
      status: "PUBLISHED",
      primaryLocale: "en",
    },
  });
  siteId = site.id;
  await prisma.cmsDomain.create({
    data: {
      organizationId: ORG,
      siteId,
      hostname: HOST,
      status: "ACTIVE",
      verificationToken: SITE_SLUG,
    },
  });
});

afterAll(async () => {
  if (!enabled) {
    return;
  }
  await cleanup();
  await prisma.$disconnect();
});

describe.skipIf(!enabled)("published page rename creates a permanent redirect", () => {
  it("writes the redirect and its audit in the same transaction", async () => {
    const pageId = await seedPage({ path: RENAME_A, status: "PUBLISHED" });

    await rename(pageId, RENAMED_A);

    expect(await findRedirect(RENAME_A)).toMatchObject({
      targetUrl: RENAMED_A,
      type: "PERMANENT",
    });
    const audit = await prisma.cmsAuditTrail.findFirst({
      where: { organizationId: ORG, siteId, entityId: pageId, action: "PAGE_MOVED" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.changesJson).toMatchObject({
      redirect: { sourcePath: RENAME_A, targetPath: RENAMED_A, type: "PERMANENT" },
    });
    expect(await countRedirects(RENAME_A)).toBe(1);
  });

  it("flattens a redirect chain that pointed at the old address", async () => {
    const pageId = await seedPage({ path: RENAME_B, status: "PUBLISHED" });
    await seedRedirect("/legacy-b", RENAME_B);

    await rename(pageId, RENAMED_B);

    expect((await findRedirect("/legacy-b"))?.targetUrl).toBe(RENAMED_B);
    expect((await findRedirect(RENAME_B))?.targetUrl).toBe(RENAMED_B);
  });

  it("removes a stale redirect that occupied the new address", async () => {
    const pageId = await seedPage({ path: RENAME_C, status: "PUBLISHED" });
    await seedRedirect(OCCUPIED_C, "/elsewhere-c");

    await rename(pageId, OCCUPIED_C);

    expect(await countRedirects(OCCUPIED_C)).toBe(0);
    expect(
      await prisma.cmsPage.count({
        where: { organizationId: ORG, siteId, slug: OCCUPIED_C },
      })
    ).toBe(1);
    expect((await findRedirect(RENAME_C))?.targetUrl).toBe(OCCUPIED_C);
  });

  it("never creates a redirect for a draft page", async () => {
    const pageId = await seedPage({ path: "/draft-c", status: "DRAFT" });

    await rename(pageId, "/draft-c-new");

    expect(await countRedirects("/draft-c")).toBe(0);
  });
});

describe.skipIf(!enabled)("sitemap reflects published redirects", () => {
  it("excludes the redirected address and keeps the new published address", async () => {
    const outcome = await readPublishedSitemap(HOST);

    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") {
      return;
    }
    const paths = outcome.sitemap.pages.map((page) => page.path);
    expect(paths).not.toContain(RENAME_A);
    expect(paths).toContain(RENAMED_A);
    expect(paths).not.toContain(RENAME_B);
    expect(paths).toContain(RENAMED_B);
    expect(paths).not.toContain(RENAME_C);
  });
});
