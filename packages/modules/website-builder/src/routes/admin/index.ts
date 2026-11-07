import { OpenAPIHono } from "@hono/zod-openapi";
import { createAdminPagesRouter } from "./pages.js";
import { createAdminSitesRouter } from "./sites.js";
import { createAdminSubdomainRouter } from "./subdomain.js";
import { PageService } from "../../services/page-service.js";
import { SiteService } from "../../services/site-service.js";

export function createAdminRouter(
  pageService?: PageService,
  siteService?: SiteService
): OpenAPIHono {
  const router = new OpenAPIHono();
  const pages = pageService ?? new PageService();
  const sites = siteService ?? new SiteService();

  // Mount Sites endpoints
  router.route("/", createAdminSitesRouter(sites));

  // Mount Pages endpoints
  router.route("/", createAdminPagesRouter(pages));

  // Mount Subdomain checker endpoints
  router.route("/", createAdminSubdomainRouter(sites));

  return router;
}

export * from "./pages.js";
export * from "./sites.js";
export * from "./subdomain.js";
