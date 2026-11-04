import { OpenAPIHono } from "@hono/zod-openapi";
import { adminFlagsRouter } from "../admin-flags.js";
import { tenantAdminRouter } from "./tenants.js";
import { tenantPiiRouter } from "./tenant-pii.js";
import { tenantLifecycleRouter } from "./lifecycle.js";

/**
 * Admin API mount point. Future Platform routes join this router; request id,
 * rate limiting and RFC 7807 handling remain in the global app pipeline.
 */
export const adminRouter = new OpenAPIHono();

adminRouter.route("/", adminFlagsRouter);
adminRouter.route("/", tenantAdminRouter);
adminRouter.route("/", tenantPiiRouter);
adminRouter.route("/", tenantLifecycleRouter);
