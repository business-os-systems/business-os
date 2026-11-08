import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import {
  createSuccessResponseBody,
  PLATFORM_CAPABILITIES,
  RATE_LIMITS,
  problemDetailsSchema,
} from "@suite/core";
import { controlPlaneOriginGuard } from "../../middleware/control-plane-origin.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { getControlSessionSecret } from "../../lib/platform-env.js";
import { getPlatformPrismaClient } from "../../lib/platform-db.js";
import {
  createCatalogValue,
  listReferenceCatalogs,
  updateCatalogValue,
} from "../../services/admin/catalog-admin.service.js";
import {
  catalogListSchema,
  catalogParamsSchema,
  catalogValueParamsSchema,
  catalogValueSchema,
  createCatalogValueBodySchema,
  updateCatalogValueBodySchema,
} from "../../services/admin/catalog-admin.contract.js";
import { envelope, errorResponses, platformValidationHook } from "./openapi-shared.js";
import {
  createLazyDefaultCapabilityGuard,
  readActor,
  readRequestId,
} from "./platform-route-shared.js";

const PLATFORM_CATALOGS = PLATFORM_CAPABILITIES.CATALOGS_MANAGE.code;
const CATALOGS_TAG = "Platform Reference Catalogs";
export const REFERENCE_CATALOG_RATE_LIMIT_KEY = "rl:admin:catalogs";
export const REFERENCE_CATALOG_READ_RATE_LIMIT_KEY = "rl:admin:catalogs:read";

const catalogErrors = {
  ...errorResponses,
  404: {
    description: "Unknown reference catalog or value",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  409: {
    description: "Duplicate reference code or stale version",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
} as const;

const listCatalogsRoute = createRoute({
  method: "get",
  path: "/",
  tags: [CATALOGS_TAG],
  summary: "List the reference catalogs",
  description:
    "Returns the ten database-owned reference catalogs with every value, including retired values. The Platform editor needs both active and retired rows so a value can be reactivated (FR-101, FR-107, CT-7).",
  responses: {
    200: {
      description: "Reference catalogs",
      content: { "application/json": { schema: envelope(catalogListSchema) } },
    },
    ...catalogErrors,
  },
});

const createValueRoute = createRoute({
  method: "post",
  path: "/{category}/values",
  tags: [CATALOGS_TAG],
  summary: "Add a reference catalog value",
  description:
    "Normalizes and validates the code against the catalog's format, rejects a duplicate code and writes the audit row in the same transaction (FR-101, FR-107, CT-7).",
  request: {
    params: catalogParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: createCatalogValueBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Created reference value",
      content: { "application/json": { schema: envelope(catalogValueSchema) } },
    },
    ...catalogErrors,
  },
});

const updateValueRoute = createRoute({
  method: "patch",
  path: "/{category}/values/{code}",
  tags: [CATALOGS_TAG],
  summary: "Relabel, reorder, edit or retire a reference value",
  description:
    "Updates only the supplied fields. Retirement sets isActive=false and never deletes the row; the version guard rejects a stale edit with 409 CATALOG_VERSION_CONFLICT. The audit row is written in the same transaction (FR-101, FR-107, FR-114, CT-7).",
  request: {
    params: catalogValueParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateCatalogValueBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Updated reference value",
      content: { "application/json": { schema: envelope(catalogValueSchema) } },
    },
    ...catalogErrors,
  },
});

export const platformCatalogsRouter = new OpenAPIHono({
  defaultHook: platformValidationHook,
});

const catalogReadLimiter = rateLimitMiddleware({
  limit: RATE_LIMITS.MAX_CATALOG_READS_PER_MINUTE,
  windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
  keyPrefix: REFERENCE_CATALOG_READ_RATE_LIMIT_KEY,
  failureMode: "closed",
  methods: ["GET", "HEAD"],
});

const catalogMutationLimiter = rateLimitMiddleware({
  limit: RATE_LIMITS.MAX_CATALOG_MUTATIONS_PER_MINUTE,
  windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
  keyPrefix: REFERENCE_CATALOG_RATE_LIMIT_KEY,
  failureMode: "closed",
  methods: ["POST", "PATCH"],
});

const catalogCapabilityGuard = createLazyDefaultCapabilityGuard(() => ({
  prisma: getPlatformPrismaClient(),
  secret: getControlSessionSecret(),
  capability: PLATFORM_CATALOGS,
}));

const readMiddleware: MiddlewareHandler[] = [
  catalogReadLimiter,
  controlPlaneOriginGuard,
  catalogCapabilityGuard,
];

const writeMiddleware: MiddlewareHandler[] = [
  catalogMutationLimiter,
  controlPlaneOriginGuard,
  catalogCapabilityGuard,
];

platformCatalogsRouter.openapi({ ...listCatalogsRoute, middleware: readMiddleware }, async (c) => {
  const data = await listReferenceCatalogs(getPlatformPrismaClient());
  return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 200);
});

platformCatalogsRouter.openapi({ ...createValueRoute, middleware: writeMiddleware }, async (c) => {
  const { category } = c.req.valid("param");
  const body = c.req.valid("json");
  const actor = readActor(c);
  const data = await createCatalogValue(getPlatformPrismaClient(), {
    category,
    body,
    operatorId: actor.operatorId,
    requestId: actor.requestId,
  });
  return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 200);
});

platformCatalogsRouter.openapi({ ...updateValueRoute, middleware: writeMiddleware }, async (c) => {
  const { category, code } = c.req.valid("param");
  const body = c.req.valid("json");
  const actor = readActor(c);
  const data = await updateCatalogValue(getPlatformPrismaClient(), {
    category,
    code,
    body,
    operatorId: actor.operatorId,
    requestId: actor.requestId,
  });
  return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 200);
});
