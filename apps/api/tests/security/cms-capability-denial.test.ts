import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { PERMISSIONS } from "@suite/core";
import { globalErrorHandler } from "../../src/middleware/error-handler.js";
import { createCmsInquiriesRouter } from "../../src/routes/cms/inquiries.js";
import { createCmsPagesRouter } from "../../src/routes/cms/pages.js";
import { createCmsSitesRouter } from "../../src/routes/cms/sites.js";
import {
  createTenantCapabilityGuard,
  readTenantActor,
} from "../../src/middleware/tenant-capability.js";

const DENIED_CODE = "CAPABILITY_DENIED";
const CMS_MOUNT = "/api/v1/cms";

interface Variables {
  user: { permissions?: string[] };
  userId?: string;
  organizationId?: string;
}

function createApp(permissions: readonly string[], withTenant = true) {
  const app = new Hono<{ Variables: Variables }>();
  app.onError(globalErrorHandler);
  app.use("*", async (c, next) => {
    c.set("user", { permissions: [...permissions] });
    if (withTenant) {
      c.set("userId", "usr_capability");
      c.set("organizationId", "org_capability");
    }
    await next();
  });
  app.get("/read", createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.PAGES_READ), (c) => {
    readTenantActor(c);
    return c.json({ ok: true });
  });
  app.post("/write", createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.PAGES_WRITE), (c) => {
    readTenantActor(c);
    return c.json({ ok: true });
  });
  return app;
}

describe("CMS capability denial (T084, CT-1, CT-2)", () => {
  it("denies a read when the session has no permissions", async () => {
    const response = await createApp([]).request("/read");
    expect(response.status).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe(DENIED_CODE);
  });

  it("denies a write for a pages:read-only session", async () => {
    const app = createApp([PERMISSIONS.WEBSITE_BUILDER.PAGES_READ]);
    expect((await app.request("/read")).status).toBe(200);
    const write = await app.request("/write", { method: "POST" });
    expect(write.status).toBe(403);
    expect(((await write.json()) as { code: string }).code).toBe(DENIED_CODE);
  });

  it("denies a read for a pages:write-only session", async () => {
    const response = await createApp([PERMISSIONS.WEBSITE_BUILDER.PAGES_WRITE]).request("/read");
    expect(response.status).toBe(403);
  });

  it("admits the exact capability and the domain wildcard", async () => {
    const allowed = [
      [PERMISSIONS.WEBSITE_BUILDER.PAGES_READ],
      [PERMISSIONS.WEBSITE_BUILDER.ALL],
      [PERMISSIONS.WILDCARD],
    ];
    const responses = await Promise.all(
      allowed.map(async (permissions) => createApp(permissions).request("/read"))
    );
    for (const response of responses) {
      expect(response.status).toBe(200);
    }
  });

  it("fails closed when the verified session has no tenant identity", async () => {
    const response = await createApp([PERMISSIONS.WILDCARD], false).request("/read");
    expect(response.status).toBe(401);
    expect(((await response.json()) as { code: string }).code).toBe("AUTH_REQUIRED");
  });
});
type CmsRouteCase = readonly [method: "GET" | "POST" | "PATCH" | "DELETE", path: string];

const CMS_ROUTES: readonly CmsRouteCase[] = [
  ["GET", "/sites"],
  ["POST", "/sites"],
  ["GET", "/sites/site_x"],
  ["GET", "/templates"],
  ["GET", "/sites/site_x/pages"],
  ["POST", "/sites/site_x/pages"],
  ["GET", "/pages/page_x"],
  ["PATCH", "/pages/page_x"],
  ["DELETE", "/pages/page_x"],
  ["GET", "/inquiries"],
  ["GET", "/inquiries/unread-count"],
  ["GET", "/inquiries/inquiry_x"],
  ["PATCH", "/inquiries/inquiry_x"],
  ["DELETE", "/inquiries/inquiry_x"],
];

function createCmsApp() {
  const app = new Hono<{ Variables: Variables }>();
  app.onError(globalErrorHandler);
  app.use("*", async (c, next) => {
    c.set("user", { permissions: [] });
    c.set("userId", "usr_capability");
    c.set("organizationId", "org_capability");
    await next();
  });
  app.route(CMS_MOUNT, createCmsSitesRouter());
  app.route(CMS_MOUNT, createCmsPagesRouter());
  app.route(CMS_MOUNT, createCmsInquiriesRouter());
  return app;
}

describe("CMS route capability wiring (T084)", () => {
  it.each(CMS_ROUTES)("denies %s %s without a capability", async (method, path) => {
    const response = await createCmsApp().request("/api/v1/cms" + path, { method });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe(DENIED_CODE);
  });
});
