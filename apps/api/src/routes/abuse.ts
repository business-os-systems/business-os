import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { createSuccessResponseBody, problemDetailsSchema } from "@suite/core";
import { envelope } from "./admin/openapi-shared.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";
import { getAbuseContactEmail } from "../lib/env.js";

const ABUSE_RESPONSE_PATH = "/abuse";

const contactSchema = z
  .object({
    contactEmail: z.string().email(),
    responsePath: z.string().startsWith("/"),
    reportDriven: z.literal(true),
  })
  .strict();

const contactRoute = createRoute({
  method: "get",
  path: "/contact",
  tags: ["Abuse"],
  summary: "Read the published abuse contact",
  description:
    "A monitored address reaches the operator response path. Release one detection is report-driven with structural safeguards; this endpoint makes no automatic-detection claim (FR-131, FR-137).",
  responses: {
    200: {
      description: "Monitored abuse contact",
      content: { "application/json": { schema: envelope(contactSchema) } },
    },
    500: {
      description: "The abuse contact is not configured",
      content: { "application/problem+json": { schema: problemDetailsSchema } },
    },
  },
});

/** Public, unauthenticated and rate-limited: it exposes no tenant data. */
export const abuseRouter = new OpenAPIHono();

abuseRouter.use(
  "*",
  rateLimitMiddleware({
    limit: 60,
    windowSeconds: 60,
    keyPrefix: "rl:abuse-contact",
    failureMode: "closed",
  })
);

abuseRouter.openapi(contactRoute, (c) => {
  const contactEmail = getAbuseContactEmail();
  const requestId = c.get("requestId");
  return c.json(
    createSuccessResponseBody({
      data: {
        contactEmail,
        responsePath: ABUSE_RESPONSE_PATH,
        reportDriven: true as const,
      },
      requestId: typeof requestId === "string" ? requestId : "unknown",
    }),
    200
  );
});
