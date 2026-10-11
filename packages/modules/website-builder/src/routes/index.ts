import { OpenAPIHono } from "@hono/zod-openapi";
import { createStorefrontRouter } from "./storefront.js";
import { createFormRouter } from "./forms.js";

/**
 * Creates module sub-router for public and management website builder routes
 */
export function createWebsiteBuilderRoutes(): OpenAPIHono {
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

  return router;
}

export * from "./storefront.js";
export * from "./forms.js";
