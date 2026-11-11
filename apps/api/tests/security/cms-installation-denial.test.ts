import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "@suite/db";
import { PERMISSIONS, PLATFORM_ERROR_CODE } from "@suite/core";
import { globalErrorHandler } from "../../src/middleware/error-handler.js";
import { createWebsiteBuilderInstallationGuard } from "../../src/middleware/website-builder-installation.js";
import { createCmsRouter } from "../../src/routes/cms/index.js";
import { readWebsiteBuilderInstallation } from "../../src/services/cms/installation-reader.js";
import { createTestSessionToken } from "../helpers/auth.js";

/**
 * The CMS administration surface is tenant application data. A workspace that
 * has not installed Website Builder must be refused before any route reads or
 * writes a site, page, inquiry or catalog record (FR-013, T142).
 */
const RUN = Date.now().toString(36);
const ORG_UNINSTALLED = "org_wt373_uninstalled_" + RUN;
const ORG_INSTALLED = "org_wt373_installed_" + RUN;
const ORG_DISABLED = "org_wt373_disabled_" + RUN;
const USER_ID = "usr_wt373_actor";

const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string(),
});

const siteListSchema = z.object({
  success: z.literal(true),
  data: z.object({ items: z.array(z.unknown()), nextCursor: z.string().nullable() }),
});

type CmsMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface CmsRouteCase {
  readonly method: CmsMethod;
  readonly path: string;
}

/** Every route mounted by createCmsRouter, with placeholder identifiers. */
const CMS_ROUTES: readonly CmsRouteCase[] = [
  { method: "GET", path: "/sites" },
  { method: "POST", path: "/sites" },
  { method: "GET", path: "/sites/site_x" },
  { method: "GET", path: "/templates" },
  { method: "GET", path: "/sites/site_x/pages" },
  { method: "POST", path: "/sites/site_x/pages" },
  { method: "GET", path: "/pages/page_x" },
  { method: "PATCH", path: "/pages/page_x" },
  { method: "DELETE", path: "/pages/page_x" },
  { method: "GET", path: "/pages/page_x/content" },
  { method: "PATCH", path: "/pages/page_x/content" },
  { method: "GET", path: "/pages/page_x/versions" },
  { method: "POST", path: "/pages/page_x/versions/1/restore" },
  { method: "POST", path: "/sites/site_x/review" },
  { method: "GET", path: "/sites/site_x/review/review_x" },
  {
    method: "POST",
    path: "/sites/site_x/review/review_x/pages/page_x/opened",
  },
  { method: "POST", path: "/sites/site_x/publish" },
  { method: "GET", path: "/sites/site_x/appearance" },
  { method: "PUT", path: "/sites/site_x/appearance" },
  { method: "POST", path: "/sites/site_x/appearance/theme" },
  { method: "POST", path: "/sites/site_x/appearance/reset" },
  { method: "POST", path: "/sites/site_x/appearance/publish" },
  { method: "GET", path: "/themes" },
  { method: "GET", path: "/catalog/sections" },
  { method: "GET", path: "/inquiries" },
  { method: "GET", path: "/inquiries/unread-count" },
  { method: "GET", path: "/inquiries/inquiry_x" },
  { method: "PATCH", path: "/inquiries/inquiry_x" },
  { method: "DELETE", path: "/inquiries/inquiry_x" },
];

function createCmsApp() {
  const app = new Hono();
  app.onError(globalErrorHandler);
  app.route("/api/v1/cms", createCmsRouter());
  return app;
}

async function organizationToken(organizationId: string): Promise<string> {
  return createTestSessionToken({
    userId: USER_ID,
    organizationId,
    permissions: [PERMISSIONS.WILDCARD],
  });
}

async function cmsRequest(
  token: string,
  route: CmsRouteCase
): Promise<Response> {
  return createCmsApp().request("/api/v1/cms" + route.path, {
    method: route.method,
    headers: { Authorization: "Bearer " + token },
  });
}

interface GuardVariables {
  userId: string;
  organizationId: string;
}

function createGuardApp(
  options?: Parameters<typeof createWebsiteBuilderInstallationGuard>[0]
) {
  const app = new Hono<{ Variables: GuardVariables }>();
  app.onError(globalErrorHandler);
  app.use("*", async (c, next) => {
    c.set("userId", USER_ID);
    c.set("organizationId", ORG_UNINSTALLED);
    await next();
  });
  app.get(
    "/",
    createWebsiteBuilderInstallationGuard(options),
    (c) => c.json({ ok: true })
  );
  return app;
}

async function createOrganization(id: string, label: string): Promise<void> {
  await prisma.organization.create({
    data: { id, name: "WT373 " + label, slug: "wt373-" + label + "-" + RUN },
  });
}

async function installWebsiteBuilder(
  organizationId: string,
  isEnabled: boolean
): Promise<void> {
  await prisma.installedApp.create({
    data: { organizationId, appId: "website-builder", isEnabled },
  });
}

async function cleanup(): Promise<void> {
  const organizations = [ORG_UNINSTALLED, ORG_INSTALLED, ORG_DISABLED];
  await prisma.installedApp.deleteMany({
    where: { organizationId: { in: organizations } },
  });
  await prisma.organization.deleteMany({ where: { id: { in: organizations } } });
}

let uninstalledToken = "";
let installedToken = "";
let disabledToken = "";

beforeAll(async () => {
  await cleanup();
  await createOrganization(ORG_UNINSTALLED, "uninstalled");
  await createOrganization(ORG_INSTALLED, "installed");
  await createOrganization(ORG_DISABLED, "disabled");
  await installWebsiteBuilder(ORG_INSTALLED, true);
  await installWebsiteBuilder(ORG_DISABLED, false);
  uninstalledToken = await organizationToken(ORG_UNINSTALLED);
  installedToken = await organizationToken(ORG_INSTALLED);
  disabledToken = await organizationToken(ORG_DISABLED);
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("CMS installation denial (F5, FR-013, T142)", () => {
  it.each(CMS_ROUTES)(
    "denies $method $path for a tenant without the application",
    async (route) => {
      const response = await cmsRequest(uninstalledToken, route);
      const problem = problemSchema.parse(await response.json());

      expect(response.status).toBe(403);
      expect(problem.code).toBe(PLATFORM_ERROR_CODE.APP_NOT_INSTALLED);
      expect(problem.type).toBe("/errors/app-not-installed");
      expect(problem.title).toBe("Application Not Installed");
    }
  );

  it("denies a tenant whose installation is disabled", async () => {
    const response = await cmsRequest(disabledToken, { method: "GET", path: "/sites" });
    const problem = problemSchema.parse(await response.json());

    expect(response.status).toBe(403);
    expect(problem.code).toBe(PLATFORM_ERROR_CODE.APP_NOT_INSTALLED);
  });

  it("fails closed when the installation read is unavailable", async () => {
    const response = await createGuardApp({
      readInstallation: () => Promise.resolve("unavailable"),
    }).request("/");
    const problem = problemSchema.parse(await response.json());

    expect(response.status).toBe(503);
    expect(problem.code).toBe(PLATFORM_ERROR_CODE.DEPENDENCY_UNAVAILABLE);
    expect(problem.type).toBe("/errors/dependency-unavailable");
  });
});

describe("CMS installation gate fail-closed reads (F5, FR-013)", () => {
  it("fails closed when the verified session has no workspace", async () => {
    const app = new Hono<{ Variables: GuardVariables }>();
    app.onError(globalErrorHandler);
    app.get(
      "/",
      createWebsiteBuilderInstallationGuard(),
      (c) => c.json({ ok: true })
    );

    const response = await app.request("/");
    const problem = problemSchema.parse(await response.json());

    expect(response.status).toBe(401);
    expect(problem.code).toBe(PLATFORM_ERROR_CODE.AUTH_REQUIRED);
  });

  it("reports an unreadable installation as unavailable", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.spyOn(prisma.installedApp, "findFirst").mockRejectedValueOnce(
      new Error("database offline")
    );

    const state = await readWebsiteBuilderInstallation(ORG_INSTALLED);

    expect(state).toBe("unavailable");
    expect(consoleError).toHaveBeenCalledWith(
      "Website Builder installation read failed:",
      "database offline"
    );
    consoleError.mockRestore();
  });

  it("leaves an installed tenant unaffected", async () => {
    const response = await cmsRequest(installedToken, { method: "GET", path: "/sites" });
    const body = siteListSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([]);
  });
});
