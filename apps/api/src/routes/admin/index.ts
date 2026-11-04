import { OpenAPIHono } from "@hono/zod-openapi";
import { adminFlagsRouter } from "../admin-flags.js";
import { tenantAdminRouter } from "./tenants.js";

/**
 * Admin API mount point. Future Platform routes join this router; request id,
 * rate limiting and RFC 7807 handling remain in the global app pipeline.
 */
export const adminRouter = new OpenAPIHono();

adminRouter.route("/", adminFlagsRouter);
adminRouter.route("/", tenantAdminRouter);
