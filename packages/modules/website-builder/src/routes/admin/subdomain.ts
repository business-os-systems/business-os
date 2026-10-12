import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { SiteService } from "../../services/site-service.js";

const SubdomainCheckResponseSchema = z.object({
  subdomain: z.string(),
  available: z.boolean(),
  suggestions: z.array(z.string()),
});

/**
 * Route: GET /api/v1/cms/admin/subdomain/check
 */
export const checkSubdomainRoute = createRoute({
  method: "get",
  path: "/subdomain/check",
  summary: "Check Subdomain Availability",
  description:
    "Verifies if subdomain is available on .business-os.site with phonetic collision fallbacks.",
  request: {
    query: z.object({
      subdomain: z.string().min(2),
    }),
  },
  responses: {
    200: {
      description: "Availability result",
      content: {
        "application/json": {
          schema: SubdomainCheckResponseSchema,
        },
      },
    },
  },
});

export function createAdminSubdomainRouter(
  siteService: SiteService = new SiteService()
): OpenAPIHono {
  const router = new OpenAPIHono();

  router.openapi(checkSubdomainRoute, async (c) => {
    const { subdomain } = c.req.valid("query");
    const result = await siteService.checkSubdomainAvailability(subdomain);
    return c.json(result, 200);
  });

  return router;
}
