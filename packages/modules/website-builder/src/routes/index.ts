import { OpenAPIHono } from "@hono/zod-openapi";
import { createStorefrontRouter } from "./storefront.js";
import { createAdminRouter } from "./admin/index.js";
import { PageService } from "../services/page-service.js";
import { SiteService } from "../services/site-service.js";

import { StorefrontService } from "../services/storefront-service.js";

/**
 * Creates module sub-router for public and management website builder routes
 */
export function createWebsiteBuilderRoutes(
  pageService?: PageService,
  siteService?: SiteService,
  storefrontService?: StorefrontService
): OpenAPIHono {
  const router = new OpenAPIHono();

  router.get("/health", (c) => {
    return c.json({
      status: "ok",
      module: "@suite/website-builder",
    });
  });

  // Mount Storefront Edge API under /storefront
  router.route("/storefront", createStorefrontRouter(storefrontService));

  // Mount Studio Management Admin API under /admin
  router.route("/admin", createAdminRouter(pageService, siteService));

  return router;
}

export * from "./storefront.js";
export * from "./admin/index.js";
