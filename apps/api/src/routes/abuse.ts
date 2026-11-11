import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { createSuccessResponseBody, problemDetailsSchema } from "@suite/core";
import { envelope, platformValidationHook } from "./admin/openapi-shared.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";
import { getAbuseContactEmail } from "../lib/env.js";
import {
  ABUSE_REPORT_CATEGORY_VALUES,
  ABUSE_REPORT_LIMITS,
  ABUSE_REPORT_OUTCOME_VALUES,
  recordAbuseReport,
} from "../services/abuse/abuse-intake.service.js";

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

const reportBodySchema = z
  .object({
    hostname: z.string().trim().min(1).max(ABUSE_REPORT_LIMITS.hostnameMaxLength),
    category: z.enum([...ABUSE_REPORT_CATEGORY_VALUES]),
    details: z
      .string()
      .trim()
      .min(ABUSE_REPORT_LIMITS.detailsMinLength)
      .max(ABUSE_REPORT_LIMITS.detailsMaxLength),
  })
  .strict();

const reportResultSchema = z
  .object({
    reportId: z.string(),
    outcome: z.enum([...ABUSE_REPORT_OUTCOME_VALUES]),
    receivedAt: z.string().datetime(),
  })
  .strict();

const reportRoute = createRoute({
  method: "post",
  path: "/reports",
  tags: ["Abuse"],
  summary: "Report a published site for abuse",
  description:
    "Records an immutable intake row with its outcome. The reported host must resolve to an ACTIVE domain on a PUBLISHED site; another report never overwrites an earlier one. The route is public and rate-limited, stores no reporter identity, and returns no tenant detail (FR-131, FR-136).",
  request: {
    body: {
      content: { "application/json": { schema: reportBodySchema } },
    },
  },
  responses: {
    201: {
      description: "Report recorded",
      content: { "application/json": { schema: envelope(reportResultSchema) } },
    },
    404: {
      description: "The host is not a published site",
      content: { "application/problem+json": { schema: problemDetailsSchema } },
    },
    422: {
      description: "Invalid report",
      content: { "application/problem+json": { schema: problemDetailsSchema } },
    },
    429: {
      description: "Too many reports",
      content: { "application/problem+json": { schema: problemDetailsSchema } },
    },
  },
});

/** Public, unauthenticated and rate-limited: it exposes no tenant data. */
export const abuseRouter = new OpenAPIHono({ defaultHook: platformValidationHook });

abuseRouter.use(
  "*",
  rateLimitMiddleware({
    limit: 60,
    windowSeconds: 60,
    keyPrefix: "rl:abuse-contact",
    failureMode: "closed",
  })
);

abuseRouter.openapi(
  {
    ...reportRoute,
    middleware: [
      rateLimitMiddleware({
        limit: 10,
        windowSeconds: 60,
        keyPrefix: "rl:abuse-report",
        failureMode: "closed",
      }),
    ],
  },
  async (c) => {
    const report = await recordAbuseReport(c.req.valid("json"));
    const requestId = c.get("requestId");
    return c.json(
      createSuccessResponseBody({
        data: {
          reportId: report.reportId,
          outcome: report.outcome,
          receivedAt: report.receivedAt,
        },
        requestId: typeof requestId === "string" ? requestId : "unknown",
      }),
      201
    );
  }
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
