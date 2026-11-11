import { createRoute, OpenAPIHono, z, type RouteHandler } from "@hono/zod-openapi";
import { hasPermission, PERMISSIONS, PLATFORM_ERROR_CODE } from "@suite/core";
import { ForbiddenError, NotFoundError } from "@suite/core/errors";
import {
  INQUIRY_LIMIT,
  INQUIRY_STATUS_VALUES,
  inquiryPayloadSchema,
} from "@suite/website-builder/inquiries";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import {
  createTenantCapabilityGuard,
  readSessionPermissions,
  readTenantActor,
} from "../../middleware/tenant-capability.js";
import { clientIpMiddleware, readClientIp } from "../../lib/client-ip.js";
import { inquiryIdParamsSchema } from "../../services/cms/contract.js";
import { ingestPublicSubmission } from "../../services/cms/form-ingestion.js";
import {
  changeTenantInquiryStatus,
  countTenantUnreadInquiries,
  eraseTenantInquiry,
  getTenantInquiry,
  listTenantInquiries,
} from "../../services/cms/inquiry-service.js";
import {
  CMS_JSON_CONTENT,
  cmsEnvelope,
  cmsErrorResponses,
  cmsValidationHook,
  parseIdempotencyKey,
  readCmsRequestId,
} from "./shared.js";

const WEBSITE_BUILDER_TAG = "Website Builder";

const inquiryStatusSchema = z.enum([...INQUIRY_STATUS_VALUES]);

const inquirySummarySchema = z
  .object({
    id: z.string(),
    siteId: z.string(),
    pageId: z.string().nullable(),
    blockId: z.string(),
    status: inquiryStatusSchema,
    preview: z.string(),
    submittedAt: z.string().datetime(),
    readAt: z.string().datetime().nullable(),
    archivedAt: z.string().datetime().nullable(),
    retentionExpiresAt: z.string().datetime(),
  })
  .strict();

const inquiryContactSchema = z
  .object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  })
  .strict();

const inquiryDetailSchema = inquirySummarySchema
  .extend({
    payload: z.record(z.unknown()),
    contact: inquiryContactSchema.nullable(),
    contactRedacted: z.boolean(),
  })
  .strict();

const inquiryListSchema = z
  .object({ items: z.array(inquirySummarySchema), nextCursor: z.string().nullable() })
  .strict();

const unreadCountSchema = z.object({ count: z.number().int().nonnegative() }).strict();

const listInquiriesQuerySchema = z
  .object({
    siteId: z.string().trim().min(1).max(191).optional(),
    status: inquiryStatusSchema.optional(),
    cursor: z.string().trim().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(INQUIRY_LIMIT.max).default(INQUIRY_LIMIT.default),
  })
  .strict();

const revealPiiQuerySchema = z
  .object({ revealPii: z.enum(["true", "false"]).optional() })
  .strict();

const updateStatusBodySchema = z
  .object({ status: z.enum(["READ", "ARCHIVED", "SPAM"]) })
  .strict();

const listInquiriesRoute = createRoute({
  method: "get",
  path: "/inquiries",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "List this workspace's inquiries",
  description:
    "Cursor-paginated across every site, optionally filtered by site and status. Identity comes from the session only; contact fields are never included in a list row (FR-047, FR-127, CT-5).",
  request: { query: listInquiriesQuerySchema },
  responses: {
    200: {
      description: "Inquiries",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(inquiryListSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.LEADS_READ)],
});

const unreadCountRoute = createRoute({
  method: "get",
  path: "/inquiries/unread-count",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Count unread inquiries for the navigation badge",
  description: "Counts NEW inquiries only; another workspace's rows are invisible (FR-129).",
  responses: {
    200: {
      description: "Unread count",
      content: { [CMS_JSON_CONTENT]: { schema: cmsEnvelope(unreadCountSchema) } },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.LEADS_READ)],
});

const getInquiryRoute = createRoute({
  method: "get",
  path: "/inquiries/{inquiryId}",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Read one inquiry",
  description:
    "Contact fields are returned only when revealPii=true and the caller holds cms:leads:pii; that read is audited. Without the capability the request is refused, not silently redacted (FR-048).",
  request: { params: inquiryIdParamsSchema, query: revealPiiQuerySchema },
  responses: {
    200: {
      description: "Inquiry",
      content: {
        [CMS_JSON_CONTENT]: { schema: cmsEnvelope(z.object({ inquiry: inquiryDetailSchema })) },
      },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.LEADS_READ)],
});

const updateInquiryStatusRoute = createRoute({
  method: "patch",
  path: "/inquiries/{inquiryId}",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Move an inquiry through its status workflow",
  description:
    "Only NEW -> READ -> ARCHIVED | SPAM is accepted; an impossible transition is a 409. The status change and its audit row commit together (FR-047).",
  request: {
    params: inquiryIdParamsSchema,
    body: { content: { [CMS_JSON_CONTENT]: { schema: updateStatusBodySchema } } },
  },
  responses: {
    200: {
      description: "Updated inquiry",
      content: {
        [CMS_JSON_CONTENT]: { schema: cmsEnvelope(z.object({ inquiry: inquirySummarySchema })) },
      },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.LEADS_READ)],
});

const eraseInquiryRoute = createRoute({
  method: "delete",
  path: "/inquiries/{inquiryId}",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Erase an inquiry before its retention deadline",
  description:
    "The erasure path for a personal-data request. Requires cms:leads:pii and writes an audit row before deleting the record (FR-049).",
  request: { params: inquiryIdParamsSchema },
  responses: {
    200: {
      description: "Inquiry erased",
      content: {
        [CMS_JSON_CONTENT]: { schema: cmsEnvelope(z.object({ erased: z.literal(true) })) },
      },
    },
    ...cmsErrorResponses,
  },
  middleware: [createTenantCapabilityGuard(PERMISSIONS.WEBSITE_BUILDER.LEADS_PII)],
});

function envelope<T>(data: T, requestId: string) {
  return {
    success: true as const,
    data,
    requestId,
    timestamp: new Date().toISOString(),
  };
}

const handleListInquiries: RouteHandler<typeof listInquiriesRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const query = c.req.valid("query");
  const data = await listTenantInquiries({
    organizationId: actor.organizationId,
    ...(query.siteId === undefined ? {} : { siteId: query.siteId }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    limit: query.limit,
  });
  return c.json(envelope(data, readCmsRequestId(c)), 200);
};

const handleUnreadCount: RouteHandler<typeof unreadCountRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const count = await countTenantUnreadInquiries(actor.organizationId);
  return c.json(envelope({ count }, readCmsRequestId(c)), 200);
};

const handleGetInquiry: RouteHandler<typeof getInquiryRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { inquiryId } = c.req.valid("param");
  const { revealPii } = c.req.valid("query");
  if (revealPii === "true" && !hasPermission(readSessionPermissions(c), PERMISSIONS.WEBSITE_BUILDER.LEADS_PII)) {
    throw new ForbiddenError(
      "Reading inquiry contact details requires the cms:leads:pii capability.",
      { code: PLATFORM_ERROR_CODE.CAPABILITY_DENIED }
    );
  }
  const inquiry = await getTenantInquiry({
    organizationId: actor.organizationId,
    inquiryId,
    revealPii: revealPii === "true",
    actorUserId: actor.userId,
  });
  if (inquiry === null) {
    throw new NotFoundError("The requested inquiry was not found.", {
      code: PLATFORM_ERROR_CODE.NOT_FOUND,
    });
  }
  return c.json(envelope({ inquiry }, readCmsRequestId(c)), 200);
};

const handleUpdateStatus: RouteHandler<typeof updateInquiryStatusRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { inquiryId } = c.req.valid("param");
  const inquiry = await changeTenantInquiryStatus({
    organizationId: actor.organizationId,
    inquiryId,
    status: c.req.valid("json").status,
    actorUserId: actor.userId,
  });
  if (inquiry === null) {
    throw new NotFoundError("The requested inquiry was not found.", {
      code: PLATFORM_ERROR_CODE.NOT_FOUND,
    });
  }
  return c.json(envelope({ inquiry }, readCmsRequestId(c)), 200);
};

const handleEraseInquiry: RouteHandler<typeof eraseInquiryRoute, never> = async (c) => {
  const actor = readTenantActor(c);
  const { inquiryId } = c.req.valid("param");
  const erased = await eraseTenantInquiry({
    organizationId: actor.organizationId,
    inquiryId,
    actorUserId: actor.userId,
  });
  if (!erased) {
    throw new NotFoundError("The requested inquiry was not found.", {
      code: PLATFORM_ERROR_CODE.NOT_FOUND,
    });
  }
  return c.json(envelope({ erased: true as const }, readCmsRequestId(c)), 200);
};

export function createCmsInquiriesRouter(): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: cmsValidationHook });
  router.openapi(unreadCountRoute, handleUnreadCount);
  router.openapi(listInquiriesRoute, handleListInquiries);
  router.openapi(getInquiryRoute, handleGetInquiry);
  router.openapi(updateInquiryStatusRoute, handleUpdateStatus);
  router.openapi(eraseInquiryRoute, handleEraseInquiry);
  return router;
}

// ---------------------------------------------------------------------------
// Public storefront intake. No session: the published site is the only key and
// the response never discloses whether a challenge or honeypot failed.
// ---------------------------------------------------------------------------

/** OpenAPI documents the recursive inquiry JSON as an object; ingestion validates the real schema. */
const inquiryPayloadJsonSchema = z.record(z.string(), z.unknown()) as unknown as typeof inquiryPayloadSchema;

const publicSubmissionBodySchema = z
  .object({
    payload: inquiryPayloadJsonSchema,
    attachments: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(255),
            url: z.string().trim().min(1).max(2048),
            size: z.number().int().nonnegative(),
          })
          .strict()
      )
      .max(5)
      .optional(),
    turnstileToken: z.string().max(4096).optional(),
    honeypot: z.string().max(512).optional(),
  })
  .strict();

const publicSubmissionParamsSchema = z
  .object({
    siteId: z.string().trim().min(1).max(191),
    blockId: z.string().trim().min(1).max(100),
  })
  .strict();

const publicSubmissionResultSchema = z
  .object({
    inquiryId: z.string(),
    receivedAt: z.string().datetime(),
    duplicate: z.boolean(),
  })
  .strict();

const submitInquiryRoute = createRoute({
  method: "post",
  path: "/{siteId}/{blockId}/submit",
  tags: [WEBSITE_BUILDER_TAG],
  summary: "Submit a published form",
  description:
    "Idempotent by the Idempotency-Key header. Refuses sensitive field names, quarantines bot verdicts without revealing the check, stores no raw contact hash input and sends no notification (FR-044 to FR-046, FR-138).",
  request: {
    params: publicSubmissionParamsSchema,
    body: { content: { [CMS_JSON_CONTENT]: { schema: publicSubmissionBodySchema } } },
  },
  responses: {
    201: {
      description: "Submission accepted",
      content: {
        [CMS_JSON_CONTENT]: { schema: cmsEnvelope(publicSubmissionResultSchema) },
      },
    },
    400: {
      description: "Invalid submission",
      content: { "application/problem+json": { schema: z.record(z.unknown()) } },
    },
    404: {
      description: "Site not available",
      content: { "application/problem+json": { schema: z.record(z.unknown()) } },
    },
    413: {
      description: "Payload too large",
      content: { "application/problem+json": { schema: z.record(z.unknown()) } },
    },
  },
  middleware: [
    clientIpMiddleware,
    rateLimitMiddleware({
      limit: 20,
      windowSeconds: 60,
      keyPrefix: "rl:storefront-inquiries",
      failureMode: "closed",
    }),
  ],
});

const handleSubmitInquiry: RouteHandler<typeof submitInquiryRoute, never> = async (c) => {
  const { siteId, blockId } = c.req.valid("param");
  const body = c.req.valid("json");
  const result = await ingestPublicSubmission({
    siteId,
    blockId,
    idempotencyKey: parseIdempotencyKey(
      c.req.header("Idempotency-Key") ?? c.req.header("x-idempotency-key")
    ),
    payload: body.payload,
    attachments: body.attachments ?? [],
    turnstileToken: body.turnstileToken ?? null,
    honeypot: body.honeypot ?? null,
    clientIp: readClientIp(c),
    userAgent: c.req.header("user-agent") ?? "",
  });
  return c.json(envelope(result, readCmsRequestId(c)), 201);
};

export function createPublicInquiryRouter(): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: cmsValidationHook });
  router.openapi(submitInquiryRoute, handleSubmitInquiry);
  return router;
}
