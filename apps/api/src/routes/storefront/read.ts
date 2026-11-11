import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { createProblemEnvelope, problemDetailsSchema } from "@suite/core";
import { normalizeHostname } from "@suite/core";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { resolveClientIp } from "../../lib/client-ip.js";
import { platformValidationHook } from "../admin/openapi-shared.js";
import {
  STOREFRONT_ERROR_CODE,
  STOREFRONT_ERROR_DETAIL,
  STOREFRONT_ERROR_TITLE,
  STOREFRONT_SITE_STATUS,
  storefrontHostQuerySchema,
  storefrontPageQuerySchema,
  storefrontPageResponseSchema,
  storefrontResolveResponseSchema,
  type StorefrontReadService,
} from "../../services/storefront/contract.js";
import { storefrontReadService } from "../../services/storefront/storefront.service.js";
import { readPublishedSitemap } from "../../services/storefront/storefront-read-service.js";

/**
 * Public storefront read contract (T054).
 *
 * Anonymous by construction: no auth middleware, no session read and no cookie
 * write. A host is the only tenant selector, and every unresolved, draft or
 * cross-tenant case answers with the same neutral 404. Responses are never
 * shared between hosts and are marked no-store so the HTML delivery layer owns
 * the only public cache.
 */

const STOREFRONT_TAG = "Storefront";
const READ_CACHE_CONTROL = "private, no-store";
const STOREFRONT_READ_RATE_LIMIT = {
  limit: 1200,
  windowSeconds: 60,
  keyPrefix: "rl:storefront:read",
} as const;

/**
 * Host keeps one tenant's response out of another tenant's cache; Origin keeps
 * the global CORS middleware's cache isolation intact on a cross-origin read.
 */
const READ_HEADERS = {
  "Cache-Control": READ_CACHE_CONTROL,
  Vary: "Origin, Host",
} as const;

const zSitemapResponse = z
  .object({
    site: z
      .object({ title: z.string(), homePath: z.string(), defaultLocale: z.string() })
      .strict(),
    pages: z.array(
      z.object({ path: z.string(), lastModified: z.string().datetime() }).strict()
    ),
    redirects: z.array(
      z.object({ sourcePath: z.string(), targetPath: z.string() }).strict()
    ),
  })
  .strict();

const SITEMAP_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
  Vary: "Origin, Host",
} as const;

const problemResponse = {
  description: "Neutral problem details (no tenant existence is revealed)",
  content: { "application/problem+json": { schema: problemDetailsSchema } },
} as const;

const resolveRoute = createRoute({
  method: "get",
  path: "/resolve",
  tags: [STOREFRONT_TAG],
  summary: "Resolve a public host to its published site",
  description:
    "Returns only the published site's public metadata and visitor-facing appearance snapshot. Unknown hosts and unpublished sites share one neutral 404; a suspended or archived site is 410 (contract storefront).",
  request: { query: storefrontHostQuerySchema },
  responses: {
    200: {
      description: "Published site metadata",
      content: { "application/json": { schema: storefrontResolveResponseSchema } },
    },
    404: problemResponse,
    410: problemResponse,
    422: problemResponse,
    429: problemResponse,
  },
});

const sitemapRoute = createRoute({
  method: "get",
  path: "/sitemap",
  tags: [STOREFRONT_TAG],
  summary: "List a published site's indexable addresses",
  description:
    "Published pages only; redirected and archived addresses are removed. The response is public but host-keyed so two tenants never share a cache entry (FR-038, FR-040, FR-115).",
  request: { query: storefrontHostQuerySchema },
  responses: {
    200: {
      description: "Published sitemap entries",
      content: { "application/json": { schema: zSitemapResponse } },
    },
    404: problemResponse,
    410: problemResponse,
    422: problemResponse,
    429: problemResponse,
  },
});

const pageRoute = createRoute({
  method: "get",
  path: "/page",
  tags: [STOREFRONT_TAG],
  summary: "Read one published page for rendering",
  description:
    "Returns the published AST and the site's published appearance snapshot. A draft page, an unknown path and an unknown host are indistinguishable 404s; a suspended or archived site is 410 (FR-036, FR-042).",
  request: { query: storefrontPageQuerySchema },
  responses: {
    200: {
      description: "Published page content",
      content: { "application/json": { schema: storefrontPageResponseSchema } },
    },
    404: problemResponse,
    410: problemResponse,
    422: problemResponse,
    429: problemResponse,
  },
});

type ProblemBody = ReturnType<typeof problemDetailsSchema.parse>;

interface ProblemPayload {
  readonly status: 404 | 410;
  readonly body: ProblemBody;
  readonly headers: Record<string, string>;
}

function readRequestId(c: Context): string {
  const value: unknown = c.get("requestId");
  return typeof value === "string" ? value : "unknown";
}

function readHostBucket(c: Context): string {
  const host = normalizeHostname(c.req.query("host") ?? null) ?? "unknown-host";
  return resolveClientIp(c) + ":" + host;
}

const storefrontReadLimiter = rateLimitMiddleware({
  limit: STOREFRONT_READ_RATE_LIMIT.limit,
  windowSeconds: STOREFRONT_READ_RATE_LIMIT.windowSeconds,
  keyPrefix: STOREFRONT_READ_RATE_LIMIT.keyPrefix,
  failureMode: "open",
  methods: ["GET", "HEAD"],
  keyResolver: readHostBucket,
});

function problemPayload(
  c: Context,
  input: {
    readonly status: 404 | 410;
    readonly code: string;
    readonly title: string;
    readonly detail: string;
  }
): ProblemPayload {
  const envelope = createProblemEnvelope({
    status: input.status,
    code: input.code,
    title: input.title,
    detail: input.detail,
    instance: c.req.path,
  });
  const body = problemDetailsSchema.parse({
    ...envelope.body,
    requestId: readRequestId(c),
    timestamp: new Date().toISOString(),
  });
  return { status: input.status, body, headers: { ...envelope.init.headers, ...READ_HEADERS } };
}

function notFoundProblem(c: Context): ProblemPayload {
  return problemPayload(c, {
    status: 404,
    code: STOREFRONT_ERROR_CODE.NOT_FOUND,
    title: STOREFRONT_ERROR_TITLE.NOT_FOUND,
    detail: STOREFRONT_ERROR_DETAIL.NOT_FOUND,
  });
}

function goneProblem(c: Context): ProblemPayload {
  return problemPayload(c, {
    status: 410,
    code: STOREFRONT_ERROR_CODE.GONE,
    title: STOREFRONT_ERROR_TITLE.GONE,
    detail: STOREFRONT_ERROR_DETAIL.GONE,
  });
}

/**
 * Builds the public storefront router. The service is injected so the contract
 * can be exercised without a database and the production entry point keeps the
 * single anonymous implementation.
 */
function registerSitemapRoute(router: OpenAPIHono): void {
  router.openapi(sitemapRoute, async (c) => {
    const { host } = c.req.valid("query");
    const outcome = await readPublishedSitemap(host);
    switch (outcome.kind) {
      case "ok":
        return c.json(outcome.sitemap, 200, SITEMAP_HEADERS);
      case "gone": {
        const problem = goneProblem(c);
        return c.json(problem.body, problem.status, problem.headers);
      }
      case "not_found": {
        const problem = notFoundProblem(c);
        return c.json(problem.body, problem.status, problem.headers);
      }
    }
  });

}
export function createStorefrontRouter(
  service: StorefrontReadService = storefrontReadService
): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: platformValidationHook });
  router.use("*", storefrontReadLimiter);

  router.openapi(resolveRoute, async (c) => {
    const { host } = c.req.valid("query");
    const outcome = await service.resolveHost(host);
    switch (outcome.kind) {
      case "published":
        return c.json(
          {
            title: outcome.site.title,
            status: STOREFRONT_SITE_STATUS.PUBLISHED,
            homePath: outcome.site.homePath,
            defaultLocale: outcome.site.defaultLocale,
            theme: { tokens: outcome.site.tokens },
          },
          200,
          READ_HEADERS
        );
      case "gone": {
        const problem = goneProblem(c);
        return c.json(problem.body, problem.status, problem.headers);
      }
      case "not_found": {
        const problem = notFoundProblem(c);
        return c.json(problem.body, problem.status, problem.headers);
      }
    }
  });

  router.openapi(pageRoute, async (c) => {
    const query = c.req.valid("query");
    const outcome = await service.readPage({ host: query.host, path: query.path ?? "/" });
    switch (outcome.kind) {
      case "published":
        return c.json(
          {
            title: outcome.page.title,
            path: outcome.page.path,
            ast: outcome.page.ast,
            media: outcome.page.media,
            tokens: outcome.page.tokens,
          },
          200,
          READ_HEADERS
        );
      case "gone": {
        const problem = goneProblem(c);
        return c.json(problem.body, problem.status, problem.headers);
      }
      case "not_found": {
        const problem = notFoundProblem(c);
        return c.json(problem.body, problem.status, problem.headers);
      }
    }
  });

  registerSitemapRoute(router);

  return router;
}
