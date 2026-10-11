import { OpenAPIHono } from "@hono/zod-openapi";
import { createStorefrontRouter } from "./storefront.js";

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

  return router;
}

export * from "./storefront.js";
