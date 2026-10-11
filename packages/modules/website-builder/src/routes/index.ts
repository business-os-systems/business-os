import { OpenAPIHono } from "@hono/zod-openapi";

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

  return router;
}
