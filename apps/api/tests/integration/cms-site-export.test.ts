import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { PERMISSIONS, type PermissionCode } from "@suite/core";
import { prisma } from "@suite/db";
import { CMS_AUDIT_ACTIONS } from "@suite/website-builder/audit";
import { globalErrorHandler } from "../../src/middleware/error-handler.js";
import { createCmsSitesRouter } from "../../src/routes/cms/sites.js";
import { SITE_EXPORT_FORMAT } from "../../src/services/cms/contract.js";
import {
  cleanupCmsFixture,
  cmsTestEnabled,
  createCmsFixture,
  type CmsFixture,
} from "../helpers/cms-fixtures.js";

const RUN = Date.now().toString(36).toUpperCase();
const ACTOR = "usr_wt381_export";
const EXPORT_PATH = "/api/v1/cms/sites/";
const ASSET_ID = "asset_wt381_export_" + RUN;
const MEDIA_URL = "https://media.example.test/hero-" + RUN.toLowerCase() + ".png";
const CHILD_PAGE_ID = "page_wt381_export_child_" + RUN;

interface Variables {
  user: { permissions?: string[] };
  userId?: string;
  organizationId?: string;
}

function createExportApp(input: {
  readonly permissions: readonly PermissionCode[];
  readonly organizationId: string;
}): Hono<{ Variables: Variables }> {
  const app = new Hono<{ Variables: Variables }>();
  app.onError(globalErrorHandler);
  app.use("*", async (c, next) => {
    c.set("user", { permissions: [...input.permissions] });
    c.set("userId", ACTOR);
    c.set("organizationId", input.organizationId);
    await next();
  });
  app.route("/api/v1/cms", createCmsSitesRouter());
  return app;
}

function exportUrl(siteId: string): string {
  return EXPORT_PATH + encodeURIComponent(siteId) + "/export";
}

function plainAst(title: string) {
  return { version: 1, schemaVersion: "2026-03", meta: { title }, sections: [] };
}

function assetAst(title: string) {
  return {
    version: 1,
    schemaVersion: "2026-03",
    meta: { title },
    sections: [
      {
        id: "sec_" + RUN,
        blocks: [
          {
            id: "hero_" + RUN,
            type: "hero",
            props: {
              headline: "Asset hero",
              image: { kind: "asset", assetId: ASSET_ID, alt: "Hero" },
            },
          },
        ],
      },
    ],
  };
}

let fixture: CmsFixture;
let otherFixture: CmsFixture;
let invalidFixture: CmsFixture;
let noContentFixture: CmsFixture;
let badSettingsFixture: CmsFixture;
const extraFixtures: CmsFixture[] = [];

async function createFailureFixture(suffix: string, pageCount = 1): Promise<CmsFixture> {
  const created = await createCmsFixture({
    suffix: suffix + RUN,
    pageCount,
    changedPageCount: 0,
  });
  extraFixtures.push(created);
  return created;
}

async function seedExportPageTree(): Promise<void> {
  await prisma.mediaAsset.create({
    data: {
      id: ASSET_ID,
      organizationId: fixture.organizationId,
      fileName: "hero.png",
      mimeType: "image/png",
      sizeBytes: 128,
      checksum: "checksum-" + RUN,
      storageKey: "exports/" + RUN,
      publicUrl: MEDIA_URL,
      createdBy: ACTOR,
    },
  });
  await prisma.cmsPageContent.update({
    where: {
      pageId_organizationId: {
        pageId: fixture.pageIds[0] ?? "",
        organizationId: fixture.organizationId,
      },
    },
    data: { draftAst: assetAst("Home draft"), publishedAst: assetAst("Home live") },
  });
  await prisma.cmsPage.create({
    data: {
      id: CHILD_PAGE_ID,
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      parentId: fixture.pageIds[0],
      title: "Child",
      slug: "/child",
      orderIndex: 1,
      status: "DRAFT",
      content: { create: { draftAst: plainAst("Child draft") } },
    },
  });
}

async function seedExportSiteDetails(): Promise<void> {
  await prisma.cmsSiteSettings.create({
    data: {
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      brandName: "Export brand",
      headerAst: {},
      footerAst: {},
    },
  });
  await prisma.cmsUrlRedirect.create({
    data: {
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      sourcePath: "/old",
      targetUrl: "/new",
      type: "PERMANENT",
    },
  });
  await prisma.cmsSiteAppearance.create({
    data: {
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      draftTokens: {},
      publishedTokens: {},
      sourceTokens: {},
    },
  });
  await prisma.cmsDomain.create({
    data: {
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      hostname: "export-" + RUN.toLowerCase() + ".example.test",
      isPrimary: true,
      status: "ACTIVE",
      verificationToken: "verify-" + RUN,
      sslActive: true,
    },
  });
}

async function seedCorruptionFixtures(): Promise<void> {
  invalidFixture = await createFailureFixture("export_invalid_");
  await prisma.cmsPageContent.update({
    where: {
      pageId_organizationId: {
        pageId: invalidFixture.pageIds[0] ?? "",
        organizationId: invalidFixture.organizationId,
      },
    },
    data: { draftAst: { invalid: true } },
  });
  noContentFixture = await createFailureFixture("export_nocontent_");
  await prisma.cmsPageContent.delete({
    where: {
      pageId_organizationId: {
        pageId: noContentFixture.pageIds[0] ?? "",
        organizationId: noContentFixture.organizationId,
      },
    },
  });
  badSettingsFixture = await createFailureFixture("export_badsettings_");
  await prisma.cmsSiteSettings.create({
    data: {
      organizationId: badSettingsFixture.organizationId,
      siteId: badSettingsFixture.siteId,
      headerAst: [],
    },
  });
}

beforeAll(async () => {
  if (!cmsTestEnabled) {
    return;
  }
  fixture = await createCmsFixture({
    suffix: "export_" + RUN,
    pageCount: 2,
    changedPageCount: 1,
  });
  otherFixture = await createCmsFixture({
    suffix: "export_other_" + RUN,
    pageCount: 1,
    changedPageCount: 0,
  });
  extraFixtures.push(otherFixture);
  await seedExportPageTree();
  await seedExportSiteDetails();
  await seedCorruptionFixtures();
});

afterAll(async () => {
  if (!cmsTestEnabled) {
    return;
  }
  await prisma.mediaAsset.deleteMany({ where: { id: ASSET_ID } });
  await cleanupCmsFixture(fixture.organizationId);
  await Promise.all(
    extraFixtures.map((extra) => cleanupCmsFixture(extra.organizationId))
  );
});

beforeEach(async () => {
  if (!cmsTestEnabled) {
    return;
  }
  await prisma.cmsAuditTrail.deleteMany({
    where: { organizationId: fixture.organizationId, action: CMS_AUDIT_ACTIONS.SITE_EXPORTED },
  });
});

describe.skipIf(!cmsTestEnabled)("CMS site export format", () => {
  it("exports the site, its page tree, appearance, settings and media", async () => {
    const app = createExportApp({
      permissions: [PERMISSIONS.WEBSITE_BUILDER.SITES_READ],
      organizationId: fixture.organizationId,
    });

    const response = await app.request(exportUrl(fixture.siteId));
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      success: boolean;
      data: {
        export: {
          format: string;
          formatVersion: number;
          site: { title: string; slug: string };
          pages: {
            path: string;
            parentPath: string | null;
            isHomePage: boolean;
            draftAst: unknown;
            publishedAst: unknown;
          }[];
          domains: { hostname: string; isPrimary: boolean }[];
          appearance: { version: number } | null;
          settings: { brandName: string | null } | null;
          redirects: { sourcePath: string; targetUrl: string; type: string }[];
          media: Record<string, { url: string }>;
        };
      };
    };

    expect(body.success).toBe(true);
    const document = body.data.export;
    expect(document.format).toBe(SITE_EXPORT_FORMAT.id);
    expect(document.formatVersion).toBe(SITE_EXPORT_FORMAT.version);
    expect(document.site.title).toBe("WT351 site export_" + RUN);
    expect(document.pages).toHaveLength(3);
    expect(document.pages[0]?.isHomePage).toBe(true);
    expect(document.pages[0]?.path).toBe("/");
    expect(document.pages[0]?.draftAst).toMatchObject({ schemaVersion: "2026-03" });
    const child = document.pages.find((page) => page.path === "/child");
    expect(child?.parentPath).toBe("/");
    expect(child?.publishedAst).toBeNull();
    expect(document.domains).toEqual([
      { hostname: "export-" + RUN.toLowerCase() + ".example.test", isPrimary: true, isSubdomain: false, status: "ACTIVE" },
    ]);
    expect(document.appearance?.version).toBe(1);
    expect(document.settings?.brandName).toBe("Export brand");
    expect(document.redirects).toEqual([
      { sourcePath: "/old", targetUrl: "/new", type: "PERMANENT" },
    ]);
    expect(document.media[ASSET_ID]?.url).toBe(MEDIA_URL);
    const serialized = JSON.stringify(document);
    expect(serialized).not.toContain(fixture.organizationId);
    expect(serialized).not.toContain(fixture.siteId);
    expect(serialized).not.toContain(fixture.pageIds[0]);
  });
});

describe.skipIf(!cmsTestEnabled)("CMS site export nullable sections", () => {
  it("exports a site that has no appearance, settings, domains or redirects", async () => {
    const app = createExportApp({
      permissions: [PERMISSIONS.WEBSITE_BUILDER.SITES_READ],
      organizationId: otherFixture.organizationId,
    });

    const response = await app.request(exportUrl(otherFixture.siteId));
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      data: {
        export: {
          appearance: unknown;
          settings: unknown;
          domains: unknown[];
          redirects: unknown[];
        };
      };
    };
    expect(body.data.export.appearance).toBeNull();
    expect(body.data.export.settings).toBeNull();
    expect(body.data.export.domains).toEqual([]);
    expect(body.data.export.redirects).toEqual([]);
  });
});

describe.skipIf(!cmsTestEnabled)("CMS site export boundary", () => {
  it("never exports another workspace's site", async () => {
    const app = createExportApp({
      permissions: [PERMISSIONS.WEBSITE_BUILDER.SITES_READ],
      organizationId: fixture.organizationId,
    });

    const response = await app.request(exportUrl(otherFixture.siteId));

    expect(response.status).toBe(404);
    const audit = await prisma.cmsAuditTrail.findFirst({
      where: { organizationId: fixture.organizationId, action: CMS_AUDIT_ACTIONS.SITE_EXPORTED },
    });
    expect(audit).toBeNull();
  });
});

describe.skipIf(!cmsTestEnabled)("CMS site export denial", () => {
  it("denies an actor without the read capability and writes no audit", async () => {
    const app = createExportApp({
      permissions: [],
      organizationId: fixture.organizationId,
    });

    const response = await app.request(exportUrl(fixture.siteId));

    expect(response.status).toBe(403);
    const audit = await prisma.cmsAuditTrail.findFirst({
      where: { organizationId: fixture.organizationId, action: CMS_AUDIT_ACTIONS.SITE_EXPORTED },
    });
    expect(audit).toBeNull();
  });
});

describe.skipIf(!cmsTestEnabled)("CMS site export audit", () => {
  it("records who exported the site", async () => {
    const app = createExportApp({
      permissions: [PERMISSIONS.WEBSITE_BUILDER.SITES_READ],
      organizationId: fixture.organizationId,
    });

    const response = await app.request(exportUrl(fixture.siteId));
    expect(response.status).toBe(200);

    const audit = await prisma.cmsAuditTrail.findFirstOrThrow({
      where: { organizationId: fixture.organizationId, action: CMS_AUDIT_ACTIONS.SITE_EXPORTED },
    });
    expect(audit.actorUserId).toBe(ACTOR);
    expect(audit.entityId).toBe(fixture.siteId);
    expect(audit.changesJson).toMatchObject({
      format: SITE_EXPORT_FORMAT.id,
      formatVersion: SITE_EXPORT_FORMAT.version,
      pageCount: 3,
    });
  });
});

describe.skipIf(!cmsTestEnabled)("CMS site export corruption", () => {
  it("refuses a page whose draft body is not a page AST", async () => {
    const app = createExportApp({
      permissions: [PERMISSIONS.WEBSITE_BUILDER.SITES_READ],
      organizationId: invalidFixture.organizationId,
    });

    const response = await app.request(exportUrl(invalidFixture.siteId));

    expect(response.status).toBe(500);
  });

  it("refuses a page that has no stored content", async () => {
    const app = createExportApp({
      permissions: [PERMISSIONS.WEBSITE_BUILDER.SITES_READ],
      organizationId: noContentFixture.organizationId,
    });

    const response = await app.request(exportUrl(noContentFixture.siteId));

    expect(response.status).toBe(500);
  });

  it("refuses site settings that are not JSON objects", async () => {
    const app = createExportApp({
      permissions: [PERMISSIONS.WEBSITE_BUILDER.SITES_READ],
      organizationId: badSettingsFixture.organizationId,
    });

    const response = await app.request(exportUrl(badSettingsFixture.siteId));

    expect(response.status).toBe(500);
  });
});
