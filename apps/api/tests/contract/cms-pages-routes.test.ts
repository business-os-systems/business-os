import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { PERMISSIONS } from "@suite/core";
import { prisma } from "@suite/db";
import { globalErrorHandler } from "../../src/middleware/error-handler.js";
import { createCmsPagesRouter } from "../../src/routes/cms/pages.js";

const CMS_MOUNT = "/api/v1/cms";
const DENIED_CODE = "CAPABILITY_DENIED";

interface Variables {
  user: { permissions?: string[] };
  userId?: string;
  organizationId?: string;
}

function createApp(permissions: readonly string[]): Hono<{ Variables: Variables }> {
  const app = new Hono<{ Variables: Variables }>();
  app.onError(globalErrorHandler);
  app.use("*", async (c, next) => {
    c.set("user", { permissions: [...permissions] });
    c.set("userId", "usr_page_routes");
    c.set("organizationId", "org_page_routes");
    await next();
  });
  app.route(CMS_MOUNT, createCmsPagesRouter());
  return app;
}

type PageRoute = readonly [method: "GET" | "POST" | "PATCH" | "DELETE", path: string];

const READ_ROUTES: readonly PageRoute[] = [
  ["GET", "/sites/site_page_routes/pages"],
  ["GET", "/sites/site_page_routes/redirects"],
  ["GET", "/pages/page_page_routes"],
];

const WRITE_ROUTES: readonly PageRoute[] = [
  ["POST", "/sites/site_page_routes/pages"],
  ["PATCH", "/pages/page_page_routes"],
  ["PATCH", "/pages/page_page_routes/order"],
  ["POST", "/pages/page_page_routes/duplicate"],
  ["POST", "/pages/page_page_routes/archive"],
  ["DELETE", "/pages/page_page_routes"],
];

const ALL_ROUTES: readonly PageRoute[] = [...READ_ROUTES, ...WRITE_ROUTES];

describe("CMS page route capability wiring (CT-1, CT-2)", () => {
  it.each(ALL_ROUTES)("denies %s %s without a capability", async (method, path) => {
    const response = await createApp([]).request(CMS_MOUNT + path, { method });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe(DENIED_CODE);
  });

  it.each(WRITE_ROUTES)(
    "denies %s %s for a pages:read-only session",
    async (method, path) => {
      const response = await createApp([PERMISSIONS.WEBSITE_BUILDER.PAGES_READ]).request(
        CMS_MOUNT + path,
        { method }
      );
      expect(response.status).toBe(403);
      expect(((await response.json()) as { code: string }).code).toBe(DENIED_CODE);
    }
  );

  it.each(READ_ROUTES)(
    "denies %s %s for a pages:write-only session",
    async (method, path) => {
      const response = await createApp([PERMISSIONS.WEBSITE_BUILDER.PAGES_WRITE]).request(
        CMS_MOUNT + path,
        { method }
      );
      expect(response.status).toBe(403);
    }
  );
});

const dbEnabled = Boolean(process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL);
const RUN = Date.now().toString(36);
const DB_ORG = "org_pages_routes_" + RUN;
const DB_ACTOR = "usr_pages_routes";
const DB_SITE = "site_pages_routes_" + RUN;

interface AuthorizedVariables {
  user: { permissions?: string[] };
  userId?: string;
  organizationId?: string;
}

function createAuthorizedApp(): Hono<{ Variables: AuthorizedVariables }> {
  const app = new Hono<{ Variables: AuthorizedVariables }>();
  app.onError(globalErrorHandler);
  app.use("*", async (c, next) => {
    c.set("user", { permissions: [PERMISSIONS.WILDCARD] });
    c.set("userId", DB_ACTOR);
    c.set("organizationId", DB_ORG);
    await next();
  });
  app.route(CMS_MOUNT, createCmsPagesRouter());
  return app;
}

function jsonBody(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function requestPage(path: string, init?: RequestInit): Promise<Response> {
  return createAuthorizedApp().request(CMS_MOUNT + path, init);
}

async function createPageRow(input: {
  readonly id: string;
  readonly slug: string;
  readonly orderIndex: number;
  readonly isHomePage?: boolean;
}): Promise<void> {
  await prisma.cmsPage.create({
    data: {
      id: input.id,
      organizationId: DB_ORG,
      siteId: DB_SITE,
      title: "Page " + input.id,
      slug: input.slug,
      orderIndex: input.orderIndex,
      isHomePage: input.isHomePage ?? false,
      revision: 1,
      status: "DRAFT",
      content: { create: { draftAst: { version: 1, schemaVersion: "2026-03", sections: [] } } },
    },
  });
}

async function cleanup(): Promise<void> {
  await prisma.cmsAuditTrail.deleteMany({ where: { organizationId: DB_ORG } });
  await prisma.cmsUrlRedirect.deleteMany({ where: { organizationId: DB_ORG } });
  await prisma.cmsPageContent.deleteMany({ where: { organizationId: DB_ORG } });
  await prisma.cmsPage.deleteMany({ where: { organizationId: DB_ORG } });
  await prisma.cmsSite.deleteMany({ where: { organizationId: DB_ORG } });
  await prisma.organization.deleteMany({ where: { id: DB_ORG } });
}

beforeAll(async () => {
  if (!dbEnabled) {
    return;
  }
  await cleanup();
  await prisma.organization.create({
    data: { id: DB_ORG, name: "Pages routes", slug: "pages-routes-" + RUN },
  });
  await prisma.cmsSite.create({
    data: {
      id: DB_SITE,
      organizationId: DB_ORG,
      title: "Routes site",
      slug: "routes-site-" + RUN,
      status: "DRAFT",
      timezone: "UTC",
    },
  });
  await createPageRow({ id: "page_routes_home", slug: "/", orderIndex: 0, isHomePage: true });
  await createPageRow({ id: "page_routes_about", slug: "/about", orderIndex: 1 });
  await createPageRow({ id: "page_routes_contact", slug: "/contact", orderIndex: 2 });
  await prisma.cmsUrlRedirect.create({
    data: {
      organizationId: DB_ORG,
      siteId: DB_SITE,
      sourcePath: "/rates",
      targetUrl: "/pricing",
      type: "PERMANENT",
    },
  });
});

afterAll(async () => {
  if (!dbEnabled) {
    return;
  }
  await cleanup();
  await prisma.$disconnect();
});

describe.skipIf(!dbEnabled)("CMS page routes over the real database (FR-020, FR-080)", () => {
  it("lists the tree and redirects through the route envelope", async () => {
    const pages = await requestPage("/sites/" + DB_SITE + "/pages?limit=200");
    expect(pages.status).toBe(200);
    const pagesBody = (await pages.json()) as { data: { items: { id: string }[] } };
    expect(pagesBody.data.items.map((item) => item.id)).toContain("page_routes_about");

    const redirects = await requestPage("/sites/" + DB_SITE + "/redirects?limit=1");
    expect(redirects.status).toBe(200);
    const redirectsBody = (await redirects.json()) as {
      data: { items: { sourcePath: string }[] };
    };
    expect(redirectsBody.data.items[0]?.sourcePath).toBe("/rates");
  });

  it("reorders through the route", async () => {
    const moved = await requestPage("/pages/page_routes_contact/order", {
      ...jsonBody({ direction: "up", expectedRevision: 1 }),
      method: "PATCH",
    });
    expect(moved.status).toBe(200);
    const movedBody = (await moved.json()) as { data: { page: { orderIndex: number } } };
    expect(movedBody.data.page.orderIndex).toBe(1);
  });

  it("duplicates through the route", async () => {
    const duplicated = await requestPage("/pages/page_routes_about/duplicate", {
      method: "POST",
    });
    expect(duplicated.status).toBe(201);
    const duplicatedBody = (await duplicated.json()) as {
      data: { page: { path: string; title: string } };
    };
    expect(duplicatedBody.data.page.path).toBe("/about-copy");
    expect(duplicatedBody.data.page.title).toContain("(copy)");
  });

  it("archives through the route", async () => {
    const archived = await requestPage("/pages/page_routes_contact/archive", {
      ...jsonBody({ expectedRevision: 2 }),
      method: "POST",
    });
    expect(archived.status).toBe(200);
    const archivedBody = (await archived.json()) as { data: { page: { status: string } } };
    expect(archivedBody.data.page.status).toBe("ARCHIVED");
  });

});

describe.skipIf(!dbEnabled)("CMS page route guards over the real database (FR-020, CT-3)", () => {
  it("refuses stale, missing and malformed page mutations", async () => {
    const stale = await requestPage("/pages/page_routes_home/archive", {
      ...jsonBody({ expectedRevision: 99 }),
      method: "POST",
    });
    expect(stale.status).toBe(409);

    const missing = await requestPage("/pages/page_missing_route/duplicate", {
      method: "POST",
    });
    expect(missing.status).toBe(404);

    const malformed = await requestPage("/pages/page_routes_home/order", {
      ...jsonBody({ direction: "sideways", expectedRevision: 1 }),
      method: "PATCH",
    });
    expect(malformed.status).toBe(422);

    const unknownSite = await requestPage("/sites/site_missing_route/redirects");
    expect(unknownSite.status).toBe(404);
  });

  it("keeps the first slot as a no-op and refuses an archived reorder", async () => {
    const first = await requestPage("/pages/page_routes_home/order", {
      ...jsonBody({ direction: "up", expectedRevision: 1 }),
      method: "PATCH",
    });
    expect(first.status).toBe(200);

    const archived = await requestPage("/pages/page_routes_contact/order", {
      ...jsonBody({ direction: "up", expectedRevision: 3 }),
      method: "PATCH",
    });
    expect(archived.status).toBe(409);
  });
});
