import { OpenAPIHono } from "@hono/zod-openapi";
import { createAdminPagesRouter } from "./pages.js";
import { PageService } from "../../services/page-service.js";

export function createAdminRouter(pageService?: PageService): OpenAPIHono {
  const router = new OpenAPIHono();
  router.route("/", createAdminPagesRouter(pageService));
  return router;
}

export * from "./pages.js";
