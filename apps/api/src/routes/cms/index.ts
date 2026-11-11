import { OpenAPIHono } from "@hono/zod-openapi";
import { requireAuth } from "../../middleware/auth.js";
import { createCmsInquiriesRouter } from "./inquiries.js";
import { createCmsPagesRouter } from "./pages.js";
import { createCmsSitesRouter } from "./sites.js";

/**
 * Tenant CMS administration, mounted under /api/v1/cms behind requireAuth and
 * the tenant-access guard. Every route names its capability and reads the
 * workspace from the verified session only (contract cms-admin).
 */
export function createCmsRouter(): OpenAPIHono {
  const router = new OpenAPIHono();
  router.use("*", requireAuth());
  router.route("/", createCmsSitesRouter());
  router.route("/", createCmsPagesRouter());
  router.route("/", createCmsInquiriesRouter());
  return router;
}

export { createCmsInquiriesRouter, createPublicInquiryRouter } from "./inquiries.js";
export { createCmsPagesRouter } from "./pages.js";
export { createCmsSitesRouter } from "./sites.js";
