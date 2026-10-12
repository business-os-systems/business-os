import { OpenAPIHono } from "@hono/zod-openapi";
import { createStorefrontRouter } from "./storefront.js";
import { createFormRouter } from "./forms.js";
import { createAdminRouter } from "./admin/index.js";
import { PageService } from "../services/page-service.js";

/**
 * Creates module sub-router for public and management website builder routes
 */
export function createWebsiteBuilderRoutes(pageService?: PageService): OpenAPIHono {
  const router = new OpenAPIHono();

  router.get("/health", (c) => {
    return c.json({
      status: "ok",
      module: "@suite/website-builder",
    });
  });

  // Mount Storefront Edge API under /storefront
  router.route("/storefront", createStorefrontRouter());

  // Mount Storefront Forms API under /storefront/forms
  router.route("/storefront/forms", createFormRouter());

  // Mount Studio Management Admin API under /admin
  router.route("/admin", createAdminRouter(pageService));

  return router;
}

export * from "./storefront.js";
export * from "./forms.js";
export * from "./admin/index.js";

