import { OpenAPIHono } from "@hono/zod-openapi";
import { platformFlagsRouter } from "./flags.js";
import { platformSystemRouter } from "./system.js";
import { tenantAdminRouter } from "./tenants.js";
import { tenantPiiRouter } from "./tenant-pii.js";
import { tenantLifecycleRouter } from "./lifecycle.js";
import { siteTakedownRouter } from "./site-takedown.js";
import { siteDeletionRouter } from "./site-deletion.js";
import { platformOperatorsRouter } from "./operators.js";
import { platformOperatorPasskeysRouter } from "./operator-passkeys.js";
import { platformEntitlementsRouter } from "./entitlements.js";
import { platformQuotasRouter } from "./quotas.js";
import { platformAppCatalogRouter, websiteBuilderCatalogRouter } from "./app-catalog.js";
import { platformAppSettingsRouter } from "./app-settings.js";
import { platformAuditRouter } from "./audit.js";
import { platformCatalogsRouter } from "./catalogs.js";
import { platformImpersonationRouter } from "./impersonation.js";

/**
 * Admin API mount point. Future Platform routes join this router; request id,
 * rate limiting and RFC 7807 handling remain in the global app pipeline.
 */
export const adminRouter = new OpenAPIHono();

adminRouter.route("/system", platformSystemRouter);
adminRouter.route("/", platformAuditRouter);
adminRouter.route("/", platformImpersonationRouter);
// Routers with a wildcard guard are mounted by path prefix so their
// middleware cannot run for a sibling destination (the /flags leak).
adminRouter.route("/flags", platformFlagsRouter);
adminRouter.route("/operators", platformOperatorsRouter);
adminRouter.route("/operator-passkeys", platformOperatorPasskeysRouter);
// Mount the reference catalog first: "/catalogs" must not be read as a
// "/catalog/:appId" request by the app-catalog router.
adminRouter.route("/catalogs", platformCatalogsRouter);
// The Website Builder catalog owns a deeper prefix than any "/apps" record
// router, so mount it first; a wildcard guard on "/apps" can never gate it.
adminRouter.route("/apps/website-builder", websiteBuilderCatalogRouter);
adminRouter.route("/catalog", platformAppCatalogRouter);
adminRouter.route("/apps", platformAppSettingsRouter);
// Registered before the tenants router: that router's capability middleware is
// mounted on "/" and would otherwise gate the entitlement- and quota-only paths.
adminRouter.route("/", platformEntitlementsRouter);
adminRouter.route("/", platformQuotasRouter);
adminRouter.route("/", siteDeletionRouter);
adminRouter.route("/", siteTakedownRouter);
adminRouter.route("/", tenantAdminRouter);
adminRouter.route("/", tenantPiiRouter);
adminRouter.route("/", tenantLifecycleRouter);
