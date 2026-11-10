import { randomUUID } from "node:crypto";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import { createSuccessResponseBody, PLATFORM_CAPABILITIES } from "@suite/core";
import { controlPlaneOriginGuard } from "../../middleware/control-plane-origin.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { getControlSessionSecret } from "../../lib/platform-env.js";
import { getPlatformPrismaClient } from "../../lib/platform-db.js";
import {
  AUDIT_PAYLOAD_DISCLOSURE,
  searchAuditEvents,
  verifyAuditChain,
  type AuditPayloadDisclosure,
} from "../../services/admin/audit-query.service.js";
import { exportAuditCsv } from "../../services/admin/audit-export.service.js";
import {
  auditExportQuerySchema,
  auditPageSchema,
  auditPiiHeaderSchema,
  auditQuerySchema,
  auditVerifyQuerySchema,
  auditVerifyResultSchema,
} from "../../services/admin/audit-query.contract.js";
import { envelope, errorResponses, platformValidationHook } from "./openapi-shared.js";
import { createLazyDefaultCapabilityGuard, readActor } from "./platform-route-shared.js";

const PLATFORM_AUDIT_READ = PLATFORM_CAPABILITIES.AUDIT_READ.code;
const PLATFORM_PII_READ = PLATFORM_CAPABILITIES.PII_READ.code;
const AUDIT_TAG = "Platform Audit";
const AUDIT_SEARCH_PER_MINUTE = 60;
const AUDIT_VERIFY_PER_MINUTE = 10;
const AUDIT_EXPORT_PER_MINUTE = 10;
export const AUDIT_SEARCH_RATE_LIMIT_KEY = "rl:admin:audit:read";
export const AUDIT_VERIFY_RATE_LIMIT_KEY = "rl:admin:audit:verify";
export const AUDIT_EXPORT_RATE_LIMIT_KEY = "rl:admin:audit:export";

const auditErrors = {
  401: errorResponses[401],
  403: errorResponses[403],
  422: errorResponses[422],
} as const;

const searchRoute = createRoute({
  method: "get",
  path: "/audit",
  tags: [AUDIT_TAG],
  summary: "Search the tamper-evident audit chain",
  description:
    "Cursor-paginated cross-tenant audit search over the platform.audit_events chain. Filters are organization, actor, action and time range; the stable sort is occurredAt DESC, id DESC (CT-5). The response omits the free-text reason; that field is only disclosed by the PII-gated export (FR-039, FR-040). The before/after payloads require platform:pii:read and a valid X-PII-Reason header (5-255 chars): without the reason they are null while action, entity, requestId and recordHash are still returned, and a full disclosure writes AUDIT_SEARCHED with the reason (FR-043, CT-1).",
  request: { query: auditQuerySchema, headers: auditPiiHeaderSchema },
  responses: {
    200: {
      description: "Audit page",
      content: { "application/json": { schema: envelope(auditPageSchema) } },
    },
    ...auditErrors,
  },
});

const verifyRoute = createRoute({
  method: "get",
  path: "/audit/verify",
  tags: [AUDIT_TAG],
  summary: "Verify the audit chain",
  description:
    "Recomputes the global D-019 chain with the database verifier and audits the verification itself (FR-042, FR-044). The chain is global; organizationId is accepted for contract stability but a per-tenant walk cannot validate cross-tenant links.",
  request: { query: auditVerifyQuerySchema },
  responses: {
    200: {
      description: "Verification result",
      content: {
        "application/json": { schema: envelope(auditVerifyResultSchema) },
      },
    },
    ...auditErrors,
  },
});

const exportRoute = createRoute({
  method: "get",
  path: "/audit/export",
  tags: [AUDIT_TAG],
  summary: "Export filtered audit rows as CSV",
  description:
    "Filtered CSV export. Requires both platform:audit:read and platform:pii:read plus a recorded X-PII-Reason; the export is capped at 5,000 rows. The reason is written to the AUDIT_EXPORTED row in the same transaction as the query (FR-041, FR-043, OP-6, OP-11).",
  request: {
    query: auditExportQuerySchema,
    headers: auditPiiHeaderSchema,
  },
  responses: {
    200: {
      description: "CSV export",
      content: { "text/csv": { schema: z.string() } },
    },
    ...auditErrors,
  },
});

function auditRequestId(c: {
  get: (key: string) => unknown;
  req: { header: (name: string) => string | undefined };
}): string {
  const fromContext = c.get("requestId");
  if (typeof fromContext === "string" && fromContext !== "unknown") {
    return fromContext;
  }
  const fromHeader = c.req.header("x-request-id");
  if (typeof fromHeader === "string" && fromHeader.trim().length > 0) {
    return fromHeader.trim().slice(0, 64);
  }
  return `req_${randomUUID()}`;
}

export const platformAuditRouter = new OpenAPIHono({
  defaultHook: platformValidationHook,
});

function auditLimiter(limit: number, keyPrefix: string): MiddlewareHandler {
  return rateLimitMiddleware({
    limit,
    windowSeconds: 60,
    keyPrefix,
    failureMode: "closed",
    methods: ["GET"],
  });
}

const auditReadGuard = createLazyDefaultCapabilityGuard(() => ({
  prisma: getPlatformPrismaClient(),
  secret: getControlSessionSecret(),
  capability: PLATFORM_AUDIT_READ,
}));

const piiReadGuard = createLazyDefaultCapabilityGuard(() => ({
  prisma: getPlatformPrismaClient(),
  secret: getControlSessionSecret(),
  capability: PLATFORM_PII_READ,
}));

/**
 * The audit-read guard has already verified the control session and resolved
 * its capabilities. A missing or non-array context is redacted, never widened.
 */
function resolvePayloadDisclosure(
  c: { get: (key: string) => unknown },
  reason: string | undefined,
): AuditPayloadDisclosure {
  const capabilities = c.get("platformCapabilities");
  const holdsPiiRead =
    Array.isArray(capabilities) &&
    capabilities.some((capability: unknown) => capability === PLATFORM_PII_READ);
  // FR-043: the capability alone never discloses payloads; a recorded reason
  // is also required. Missing reason stays redacted, never an error.
  if (!holdsPiiRead || reason === undefined) {
    return AUDIT_PAYLOAD_DISCLOSURE.redacted;
  }
  return AUDIT_PAYLOAD_DISCLOSURE.full;
}

const searchMiddleware: MiddlewareHandler[] = [
  auditLimiter(AUDIT_SEARCH_PER_MINUTE, AUDIT_SEARCH_RATE_LIMIT_KEY),
  controlPlaneOriginGuard,
  auditReadGuard,
];

const verifyMiddleware: MiddlewareHandler[] = [
  auditLimiter(AUDIT_VERIFY_PER_MINUTE, AUDIT_VERIFY_RATE_LIMIT_KEY),
  controlPlaneOriginGuard,
  auditReadGuard,
];

const exportMiddleware: MiddlewareHandler[] = [
  auditLimiter(AUDIT_EXPORT_PER_MINUTE, AUDIT_EXPORT_RATE_LIMIT_KEY),
  controlPlaneOriginGuard,
  auditReadGuard,
  piiReadGuard,
];

platformAuditRouter.openapi({ ...searchRoute, middleware: searchMiddleware }, async (c) => {
  const query = c.req.valid("query");
  const headers = c.req.valid("header");
  const reason = headers["x-pii-reason"];
  const actor = readActor(c);
  const data = await searchAuditEvents(getPlatformPrismaClient(), {
    ...query,
    disclosure: resolvePayloadDisclosure(c, reason),
    readerOperatorId: actor.operatorId,
    requestId: actor.requestId,
    ...(reason === undefined ? {} : { reason }),
  });
  return c.json(
    createSuccessResponseBody({
      data,
      requestId: auditRequestId(c),
    }),
    200,
    { "Cache-Control": "no-store" },
  );
});

platformAuditRouter.openapi({ ...verifyRoute, middleware: verifyMiddleware }, async (c) => {
  const actor = readActor(c);
  const data = await verifyAuditChain(getPlatformPrismaClient(), {
    actorId: actor.operatorId,
    requestId: auditRequestId(c),
  });
  return c.json(
    createSuccessResponseBody({
      data,
      requestId: auditRequestId(c),
    }),
    200,
    { "Cache-Control": "no-store" },
  );
});

platformAuditRouter.openapi({ ...exportRoute, middleware: exportMiddleware }, async (c) => {
  const filters = c.req.valid("query");
  const headers = c.req.valid("header");
  const actor = readActor(c);
  const result = await exportAuditCsv(getPlatformPrismaClient(), {
    filters,
    operatorId: actor.operatorId,
    reason: headers["x-pii-reason"] ?? "",
    requestId: auditRequestId(c),
  });
  return c.body(result.csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="audit-export-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.csv"`,
    "Cache-Control": "no-store",
  });
});
