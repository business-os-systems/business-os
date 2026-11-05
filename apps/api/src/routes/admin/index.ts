import { OpenAPIHono } from "@hono/zod-openapi";
import { platformFlagsRouter } from "./flags.js";
import { platformSystemRouter } from "./system.js";
import { tenantAdminRouter } from "./tenants.js";
import { tenantPiiRouter } from "./tenant-pii.js";
import { tenantLifecycleRouter } from "./lifecycle.js";

/**
 * Admin API mount point. Future Platform routes join this router; request id,
 * rate limiting and RFC 7807 handling remain in the global app pipeline.
 */
export const adminRouter = new OpenAPIHono();

adminRouter.route("/system", platformSystemRouter);
// Routers with a wildcard guard are mounted by path prefix so their
// middleware cannot run for a sibling destination (the /flags leak).
adminRouter.route("/flags", platformFlagsRouter);
adminRouter.route("/", tenantAdminRouter);
adminRouter.route("/", tenantPiiRouter);
adminRouter.route("/", tenantLifecycleRouter);
