import { OpenAPIHono } from "@hono/zod-openapi";
import { platformFlagsRouter } from "./flags.js";
import { platformSystemRouter } from "./system.js";
import { tenantAdminRouter } from "./tenants.js";
import { tenantPiiRouter } from "./tenant-pii.js";
import { tenantLifecycleRouter } from "./lifecycle.js";
import { platformOperatorsRouter } from "./operators.js";
import { platformOperatorPasskeysRouter } from "./operator-passkeys.js";
import { platformEntitlementsRouter } from "./entitlements.js";
import { platformQuotasRouter } from "./quotas.js";
import { platformAppCatalogRouter } from "./app-catalog.js";
import { platformAuditRouter } from "./audit.js";
import { platformCatalogsRouter } from "./catalogs.js";

/**
 * Admin API mount point. Future Platform routes join this router; request id,
 * rate limiting and RFC 7807 handling remain in the global app pipeline.
 */
export const adminRouter = new OpenAPIHono();

adminRouter.route("/system", platformSystemRouter);
adminRouter.route("/", platformAuditRouter);
// Routers with a wildcard guard are mounted by path prefix so their
// middleware cannot run for a sibling destination (the /flags leak).
adminRouter.route("/flags", platformFlagsRouter);
adminRouter.route("/operators", platformOperatorsRouter);
adminRouter.route("/operator-passkeys", platformOperatorPasskeysRouter);
// Mount the reference catalog first: "/catalogs" must not be read as a
// "/catalog/:appId" request by the app-catalog router.
adminRouter.route("/catalogs", platformCatalogsRouter);
adminRouter.route("/catalog", platformAppCatalogRouter);
// Registered before the tenants router: that router's capability middleware is
// mounted on "/" and would otherwise gate the entitlement- and quota-only paths.
adminRouter.route("/", platformEntitlementsRouter);
adminRouter.route("/", platformQuotasRouter);
adminRouter.route("/", tenantAdminRouter);
adminRouter.route("/", tenantPiiRouter);
adminRouter.route("/", tenantLifecycleRouter);
