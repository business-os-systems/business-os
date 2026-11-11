import { OpenAPIHono } from "@hono/zod-openapi";
import { requireAuth } from "../../middleware/auth.js";
import { createCmsAppearanceRouter } from "./appearance.js";
import { createCmsCatalogRouter } from "./catalog.js";
import { createCmsContentRouter } from "./content.js";
import { createCmsInquiriesRouter } from "./inquiries.js";
import { createCmsPagesRouter } from "./pages.js";
import { createCmsReviewRouter } from "./review.js";
import { createCmsSitesRouter } from "./sites.js";
import { createCmsVersionsRouter } from "./versions.js";

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
  router.route("/", createCmsContentRouter());
  router.route("/", createCmsVersionsRouter());
  router.route("/", createCmsReviewRouter());
  router.route("/", createCmsAppearanceRouter());
  router.route("/", createCmsCatalogRouter());
  router.route("/", createCmsInquiriesRouter());
  return router;
}

export { createCmsAppearanceRouter } from "./appearance.js";
export { createCmsCatalogRouter } from "./catalog.js";
export { createCmsContentRouter } from "./content.js";
export { createCmsInquiriesRouter, createPublicInquiryRouter } from "./inquiries.js";
export { createCmsPagesRouter } from "./pages.js";
export { createCmsReviewRouter } from "./review.js";
export { createCmsSitesRouter } from "./sites.js";
export { createCmsVersionsRouter } from "./versions.js";
