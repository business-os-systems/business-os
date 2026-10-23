import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ForbiddenError } from "@suite/core/errors";
import { hasPermission } from "@suite/core/rbac";
import { PERMISSIONS } from "@suite/core/constants";
import { adminFlagsService } from "../services/admin-flags.service.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";
import { requireAuth } from "../middleware/auth.js";
import {
  ListFlagsQuerySchema,
  FlagKeyParamSchema,
  CreateFlagBodySchema,
  UpdateFlagBodySchema,
  ListFlagsResponseSchema,
  SingleFlagResponseSchema,
} from "./schemas/admin-flags.schema.js";
import type { SessionPayload } from "@suite/auth";

export const adminFlagsRouter = new OpenAPIHono();

// ──────────────────────────────────────────────────────────
//  Route-level middleware: authentication + super-admin rate limit
// ──────────────────────────────────────────────────────────
adminFlagsRouter.use("*", requireAuth());
adminFlagsRouter.use("*", rateLimitMiddleware({ limit: 60, windowSeconds: 60, keyPrefix: "rl:admin:flags" }));

// ──────────────────────────────────────────────────────────
//  Shared RFC 7807 Problem Details schema for error responses
// ──────────────────────────────────────────────────────────
const ProblemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  detail: z.string(),
  code: z.string(),
  requestId: z.string().optional(),
  timestamp: z.string(),
});

function resolveActorFromContext(c: { get: (key: string) => unknown }): { userId?: string; email?: string } {
  const user = c.get("user") as SessionPayload | undefined;
  return {
    userId: user?.userId,
    email: user?.email,
  };
}

function assertSuperAdmin(c: { get: (key: string) => unknown }): void {
  const user = c.get("user") as SessionPayload | undefined;
  const permissions: readonly string[] = user?.permissions ?? [];

  if (!hasPermission(permissions, PERMISSIONS.WILDCARD) && !hasPermission(permissions, PERMISSIONS.CORE.APPS_MANAGE)) {
    throw new ForbiddenError(
      "Super-admin capability required. This endpoint is restricted to platform administrators.",
      { code: "ADMIN_FLAGS_FORBIDDEN" }
    );
  }
}

// ──────────────────────────────────────────────────────────
//  GET /flags — List all feature flags
// ──────────────────────────────────────────────────────────

const listFlagsRoute = createRoute({
  method: "get",
  path: "/flags",
  tags: ["Admin: Feature Flags"],
  summary: "List all feature flags",
  description: "Returns all platform feature flags, optionally filtered by environment. Requires super-admin capability.",
  request: {
    query: ListFlagsQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: ListFlagsResponseSchema } },
      description: "Feature flags retrieved successfully.",
    },
    401: {
      content: { "application/problem+json": { schema: ProblemDetailsSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/problem+json": { schema: ProblemDetailsSchema } },
      description: "Insufficient permissions — super-admin required.",
    },
  },
});

adminFlagsRouter.openapi(listFlagsRoute, async (c) => {
  assertSuperAdmin(c);

  const { environment } = c.req.valid("query");
  const flags = await adminFlagsService.listFlags(environment);

  return c.json(
    {
      success: true as const,
      data: flags,
      meta: {
        total: flags.length,
        environment: environment ?? "all",
      },
      requestId: c.get("requestId") as string,
      timestamp: new Date().toISOString(),
    },
    200
  );
});

// ──────────────────────────────────────────────────────────
//  POST /flags — Create a new feature flag
// ──────────────────────────────────────────────────────────

const createFlagRoute = createRoute({
  method: "post",
  path: "/flags",
  tags: ["Admin: Feature Flags"],
  summary: "Create a new feature flag",
  description: "Creates a new platform feature flag with the specified key, name, and evaluation defaults. Requires super-admin capability.",
  request: {
    body: {
      content: { "application/json": { schema: CreateFlagBodySchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: SingleFlagResponseSchema } },
      description: "Feature flag created successfully.",
    },
    401: {
      content: { "application/problem+json": { schema: ProblemDetailsSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/problem+json": { schema: ProblemDetailsSchema } },
      description: "Insufficient permissions — super-admin required.",
    },
    409: {
      content: { "application/problem+json": { schema: ProblemDetailsSchema } },
      description: "A flag with this key already exists in the target environment.",
    },
  },
});

adminFlagsRouter.openapi(createFlagRoute, async (c) => {
  assertSuperAdmin(c);

  const body = c.req.valid("json");
  const actor = resolveActorFromContext(c);
  const flag = await adminFlagsService.createFlag(body, actor);

  return c.json(
    {
      success: true as const,
      data: flag,
      requestId: c.get("requestId") as string,
      timestamp: new Date().toISOString(),
    },
    201
  );
});

// ──────────────────────────────────────────────────────────
//  PATCH /flags/:key — Update an existing feature flag
// ──────────────────────────────────────────────────────────

const updateFlagRoute = createRoute({
  method: "patch",
  path: "/flags/{key}",
  tags: ["Admin: Feature Flags"],
  summary: "Update a feature flag",
  description: "Mutates an existing flag with optimistic concurrency control. The `expectedVersion` field must match the current database version to prevent lost updates. Requires super-admin capability.",
  request: {
    params: FlagKeyParamSchema,
    body: {
      content: { "application/json": { schema: UpdateFlagBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SingleFlagResponseSchema } },
      description: "Feature flag updated successfully.",
    },
    401: {
      content: { "application/problem+json": { schema: ProblemDetailsSchema } },
      description: "Authentication required.",
    },
    403: {
      content: { "application/problem+json": { schema: ProblemDetailsSchema } },
      description: "Insufficient permissions — super-admin required.",
    },
    404: {
      content: { "application/problem+json": { schema: ProblemDetailsSchema } },
      description: "Feature flag not found.",
    },
    409: {
      content: { "application/problem+json": { schema: ProblemDetailsSchema } },
      description: "Optimistic concurrency conflict — expectedVersion does not match current version.",
    },
  },
});

adminFlagsRouter.openapi(updateFlagRoute, async (c) => {
  assertSuperAdmin(c);

  const { key } = c.req.valid("param");
  const body = c.req.valid("json");
  const actor = resolveActorFromContext(c);
  const flag = await adminFlagsService.updateFlag(key, body, actor);

  return c.json(
    {
      success: true as const,
      data: flag,
      requestId: c.get("requestId") as string,
      timestamp: new Date().toISOString(),
    },
    200
  );
});
