import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ResolvedDomainSchema } from "../db/functions.js";
import { StorefrontService } from "../services/storefront-service.js";

/**
 * Standard RFC 7807 Problem Details Schema
 */
const ProblemDetailsSchema = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string(),
  invalidParams: z
    .array(
      z.object({
        name: z.string(),
        reason: z.string(),
      })
    )
    .optional(),
});

/**
 * Edge Storefront Delivery Route Definition
 * GET /api/v1/storefront/resolve
 */
export const resolveStorefrontRoute = createRoute({
  method: "get",
  path: "/resolve",
  summary: "Resolve Storefront Edge Delivery Contract",
  description:
    "Resolves the incoming edge request Hostname to its published site AST and brand settings without exposing internal tenant identifiers.",
  request: {
    headers: z.object({
      host: z.string().optional(),
      "x-preview-token": z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Successfully resolved published storefront metadata",
      content: {
        "application/json": {
          schema: ResolvedDomainSchema,
        },
      },
    },
    400: {
      description: "Invalid hostname or missing host header",
      content: {
        "application/problem+json": {
          schema: ProblemDetailsSchema,
        },
      },
    },
    404: {
      description: "Domain not registered or site not published",
      content: {
        "application/problem+json": {
          schema: ProblemDetailsSchema,
        },
      },
    },
  },
});

/**
 * Mounts storefront sub-router
 */
export function createStorefrontRouter(
  storefrontService: StorefrontService = new StorefrontService()
): OpenAPIHono {
  const router = new OpenAPIHono();

  router.openapi(resolveStorefrontRoute, async (c) => {
    const hostHeader = c.req.header("host") || "";
    const previewToken = c.req.header("x-preview-token");

    if (!hostHeader) {
      return c.json(
        {
          type: "https://errors.business-os.com/cms/missing-host",
          title: "Bad Request",
          status: 400,
          detail: "The Host request header is required for edge storefront resolution.",
          instance: c.req.path,
        },
        400
      );
    }

    const resolution = await storefrontService.resolveHostname(hostHeader);

    if (!resolution.resolved) {
      return c.json(
        {
          type: "https://errors.business-os.com/cms/domain-not-found",
          title: "Domain Not Found",
          status: 404,
          detail: `No published website found for domain: ${hostHeader}. Reason: ${resolution.reason}`,
          instance: c.req.path,
        },
        404
      );
    }

    // Edge Caching Headers
    // Public CDN edge cache 1 hour, stale-while-revalidate 24 hours
    // If preview token is passed, bypass public cache completely
    if (previewToken) {
      c.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
      c.header("Vary", "x-preview-token");
    } else {
      c.header(
        "Cache-Control",
        "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
      );
      c.header("Surrogate-Key", `site:${resolution.siteId} domain:${hostHeader}`);
    }

    return c.json(resolution, 200);
  });

  return router;
}
