import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Context, Env, Input, MiddlewareHandler } from "hono";
import { createSuccessResponseBody, problemDetailsSchema, RATE_LIMITS } from "@suite/core";
import { extractTokenFromCookie } from "@suite/auth/session";
import { CONTROL_SESSION_COOKIE_NAME, verifyControlSession } from "@suite/auth/platform";
import { requireAuth } from "../middleware/auth.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";
import { getControlSessionSecret } from "../lib/platform-env.js";
import { getPlatformPrismaClient } from "../lib/platform-db.js";
import { platformCatalogCache } from "../services/catalog-cache.js";
import {
  readReferenceCatalog,
  readReferenceCatalogList,
} from "../services/reference/reference-read.service.js";
import {
  referenceCatalogListSchema,
  referenceCatalogParamsSchema,
  referenceCatalogResponseSchema,
} from "../services/reference/reference-read.contract.js";
import { envelope, platformValidationHook } from "./admin/openapi-shared.js";
import { readRequestId } from "./admin/platform-route-shared.js";

/**
 * Reference read contract (FR-105, FR-112, CT-7).
 *
 * This router lives outside /admin because every application reads the shared
 * vocabularies, not only the operator console. It is read-only by construction:
 * there is no mutation route on this path, and the Platform editor's write
 * surface remains /api/v1/admin/catalogs (#232).
 */

const REFERENCE_TAG = "Reference data";
export const REFERENCE_READ_RATE_LIMIT_KEY = "rl:reference:read";
export const REFERENCE_CACHE_CONTROL = "private, max-age=60";

const referenceErrors = {
  401: {
    description: "Authentication required",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  404: {
    description: "Unknown reference catalog",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  429: {
    description: "Reference read rate limit exceeded",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  503: {
    description: "Rate limiting is temporarily unavailable",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
} as const;

const listCatalogsRoute = createRoute({
  method: "get",
  path: "/catalogs",
  tags: [REFERENCE_TAG],
  summary: "List the active reference catalogs",
  description:
    "Returns every database-owned reference catalog with its active values, plus the as-of instant. Retired values are excluded so a retired code cannot be selected again, while existing records stay readable (FR-104, FR-105, FR-113).",
  responses: {
    200: {
      description: "Active reference catalogs",
      content: { "application/json": { schema: envelope(referenceCatalogListSchema) } },
    },
    304: { description: "Not modified" },
    ...referenceErrors,
  },
});

const readCatalogRoute = createRoute({
  method: "get",
  path: "/catalogs/{key}",
  tags: [REFERENCE_TAG],
  summary: "Read one active reference catalog",
  description:
    "Returns one catalog by its canonical key with its active values. An unknown key is 404 UNKNOWN_CATALOG; a retired value is never returned (FR-104, FR-105).",
  request: { params: referenceCatalogParamsSchema },
  responses: {
    200: {
      description: "Active reference catalog",
      content: {
        "application/json": { schema: envelope(referenceCatalogResponseSchema) },
      },
    },
    304: { description: "Not modified" },
    ...referenceErrors,
  },
});

/**
 * Reference vocabularies are readable by every application role (FR-105,
 * FR-112) and carry no tenant or personal data, so authentication is the only
 * gate: a valid control session or a valid tenant session. No capability is
 * required and no write path exists. A request with neither is 401.
 */
export function createReferenceReadAuth(): MiddlewareHandler {
  return async (c, next) => {
    const controlToken = extractTokenFromCookie(
      c.req.header("Cookie"),
      CONTROL_SESSION_COOKIE_NAME,
    );
    if (controlToken !== null) {
      const session = await verifyControlSession({
        prisma: getPlatformPrismaClient(),
        secret: getControlSessionSecret(),
        token: controlToken,
      });
      if (session.valid) {
        await next();
        return;
      }
    }
    await requireAuth()(c, next);
  };
}

function writeCatalogResponse<
  E extends Env,
  P extends string,
  I extends Input,
  TPayload extends object,
>(c: Context<E, P, I>, result: { readonly payload: TPayload; readonly etag: string }): Response {
  c.header("Cache-Control", REFERENCE_CACHE_CONTROL);
  c.header("ETag", result.etag);
  if (c.req.header("If-None-Match") === result.etag) {
    return c.body(null, 304);
  }
  return c.json(
    createSuccessResponseBody({ data: result.payload, requestId: readRequestId(c) }),
    200,
  );
}

export const referenceRouter = new OpenAPIHono({
  defaultHook: platformValidationHook,
});


const referenceReadLimiter = rateLimitMiddleware({
  limit: RATE_LIMITS.MAX_CATALOG_READS_PER_MINUTE,
  windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
  keyPrefix: REFERENCE_READ_RATE_LIMIT_KEY,
  failureMode: "closed",
  methods: ["GET", "HEAD"],
});

const referenceReadAuth = createReferenceReadAuth();

const readMiddleware: MiddlewareHandler[] = [referenceReadLimiter, referenceReadAuth];

referenceRouter.openapi({ ...listCatalogsRoute, middleware: readMiddleware }, async (c) => {
  const result = await readReferenceCatalogList({
    prisma: getPlatformPrismaClient(),
    cache: platformCatalogCache,
  });
  return writeCatalogResponse(c, result);
});

referenceRouter.openapi({ ...readCatalogRoute, middleware: readMiddleware }, async (c) => {
  const { key } = c.req.valid("param");
  const result = await readReferenceCatalog({
    prisma: getPlatformPrismaClient(),
    cache: platformCatalogCache,
    catalogKey: key,
  });
  return writeCatalogResponse(c, result);
});
