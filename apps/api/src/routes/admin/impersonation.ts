import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context, Env, Input, MiddlewareHandler } from "hono";
import {
  createSuccessResponseBody,
  PLATFORM_CAPABILITIES,
  problemDetailsSchema,
  RATE_LIMITS,
} from "@suite/core";
import { controlPlaneOriginGuard } from "../../middleware/control-plane-origin.js";
import { createMutationIdempotencyMiddleware } from "../../middleware/idempotency.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { resolveClientIp } from "../../lib/client-ip.js";
import { getControlSessionSecret } from "../../lib/platform-env.js";
import { getPlatformPrismaClient } from "../../lib/platform-db.js";
import {
  endImpersonation,
  listActiveForOperator,
  startImpersonation,
} from "../../services/admin/impersonation.service.js";
import { envelope, errorResponses, platformValidationHook } from "./openapi-shared.js";
import {
  createLazyDefaultCapabilityGuard,
  readActor,
} from "./platform-route-shared.js";

const PLATFORM_IMPERSONATE = PLATFORM_CAPABILITIES.IMPERSONATE.code;
const IMPERSONATION_TAG = "Platform Support Sessions";
/** A user agent is diagnostic context, never a payload; bound what is stored. */
const MAXIMUM_USER_AGENT_LENGTH = 512;

export const IMPERSONATION_MUTATION_RATE_LIMIT_KEY = "rl:admin:impersonation";
export const IMPERSONATION_READ_RATE_LIMIT_KEY = "rl:admin:impersonation:read";

const startBodySchema = z
  .object({
    organizationId: z.string().trim().min(1).max(191),
    reason: z.string().trim().min(5).max(255),
    ticketRef: z.string().trim().min(1).max(100),
    targetUserId: z.string().trim().min(1).max(191).optional(),
  })
  .strict();

const ticketParamsSchema = z.object({
  ticketId: z.string().uuid(),
});

const startResultSchema = z
  .object({
    ticketId: z.string().uuid(),
    expiresAt: z.string().datetime(),
    tenantBannerToken: z.string().min(1),
  })
  .strict();

const endResultSchema = z
  .object({
    endedAt: z.string().datetime(),
    endedBy: z.string().min(1),
  })
  .strict();

const activeSessionSchema = z
  .object({
    ticketId: z.string().uuid(),
    organizationId: z.string().min(1),
    reason: z.string().min(1),
    ticketRef: z.string().min(1),
    startedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .strict();

const activeListSchema = z
  .object({ items: z.array(activeSessionSchema) })
  .strict();

const conflictResponse = {
  description: "A support session conflict",
  content: { "application/problem+json": { schema: problemDetailsSchema } },
} as const;

const impersonationErrors = {
  ...errorResponses,
  409: conflictResponse,
} as const;

const startRoute = createRoute({
  method: "post",
  path: "/impersonation",
  tags: [IMPERSONATION_TAG],
  summary: "Start a read-only support session",
  description:
    "Starts a time-boxed, read-only support session with a recorded reason and ticket reference. The session expires within thirty minutes and the response carries the signed ticket the tenant plane verifies (FR-045..FR-047, FR-050, SC-017). A second active session for the same operator is refused. Strong identity confirmation (FR-046) is deliberately not enforced yet: no step-up issuance route exists, so it stays tracked by T158; Idempotency-Key replay is tracked by T161/CT-4.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: startBodySchema } },
    },
  },
  responses: {
    201: {
      description: "Support session started",
      content: {
        "application/json": { schema: envelope(startResultSchema) },
      },
    },
    ...impersonationErrors,
  },
});

const endRoute = createRoute({
  method: "delete",
  path: "/impersonation/{ticketId}",
  tags: [IMPERSONATION_TAG],
  summary: "End the operator's own support session",
  description:
    "Ends one support session owned by the authenticated operator and writes IMPERSONATION_ENDED in the same transaction. A ticket owned by another operator is reported as not found (FR-047, FR-050).",
  request: { params: ticketParamsSchema },
  responses: {
    200: {
      description: "Support session ended",
      content: { "application/json": { schema: envelope(endResultSchema) } },
    },
    ...impersonationErrors,
  },
});

const activeRoute = createRoute({
  method: "get",
  path: "/impersonation/active",
  tags: [IMPERSONATION_TAG],
  summary: "List the operator's active support sessions",
  description:
    "Active support sessions owned by the authenticated operator, ordered by startedAt DESC. This powers the Platform marker that distinguishes a read-only session from normal operator use (FR-096).",
  responses: {
    200: {
      description: "Active support sessions",
      content: { "application/json": { schema: envelope(activeListSchema) } },
    },
    ...impersonationErrors,
  },
});

export const platformImpersonationRouter = new OpenAPIHono({
  defaultHook: platformValidationHook,
});

const mutationLimiter = rateLimitMiddleware({
  limit: RATE_LIMITS.MAX_IMPERSONATION_MUTATIONS_PER_MINUTE,
  windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
  keyPrefix: IMPERSONATION_MUTATION_RATE_LIMIT_KEY,
  failureMode: "closed",
  methods: ["POST", "DELETE"],
});

const readLimiter = rateLimitMiddleware({
  limit: RATE_LIMITS.MAX_IMPERSONATION_READS_PER_MINUTE,
  windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
  keyPrefix: IMPERSONATION_READ_RATE_LIMIT_KEY,
  failureMode: "closed",
  methods: ["GET", "HEAD"],
});

const impersonationCapabilityGuard = createLazyDefaultCapabilityGuard(() => ({
  prisma: getPlatformPrismaClient(),
  secret: getControlSessionSecret(),
  capability: PLATFORM_IMPERSONATE,
}));

const mutationIdempotency = createMutationIdempotencyMiddleware();

const mutationMiddleware: MiddlewareHandler[] = [
  mutationLimiter,
  controlPlaneOriginGuard,
  impersonationCapabilityGuard,
  mutationIdempotency,
];

const readMiddleware: MiddlewareHandler[] = [
  readLimiter,
  controlPlaneOriginGuard,
  impersonationCapabilityGuard,
];

interface RequestContext {
  readonly requestId: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

/**
 * Request metadata for the session row. The operator id and request id come
 * from the shared `readActor` helper so this route cannot drift from the rest
 * of the admin surface.
 */
function readRequestContext<E extends Env, P extends string, I extends Input>(
  c: Context<E, P, I>,
  requestId: string
): RequestContext {
  return {
    requestId,
    // The shared resolver honours a forwarded header only behind a trusted
    // proxy, so the stored address is not attacker-chosen (CWE-348).
    ip: resolveClientIp(c),
    userAgent:
      c.req.header("user-agent")?.slice(0, MAXIMUM_USER_AGENT_LENGTH) ?? null,
  };
}

platformImpersonationRouter.openapi(
  { ...startRoute, middleware: mutationMiddleware },
  async (c) => {
    const body = c.req.valid("json");
    const { operatorId, requestId } = readActor(c);
    const context = readRequestContext(c, requestId);
    const data = await startImpersonation(getPlatformPrismaClient(), {
      organizationId: body.organizationId,
      reason: body.reason,
      ticketRef: body.ticketRef,
      ...(body.targetUserId === undefined
        ? {}
        : { targetUserId: body.targetUserId }),
      operatorId,
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent,
    });
    return c.json(
      createSuccessResponseBody({ data, requestId: context.requestId }),
      201,
      { "Cache-Control": "no-store" }
    );
  }
);

platformImpersonationRouter.openapi(
  { ...endRoute, middleware: mutationMiddleware },
  async (c) => {
    const { ticketId } = c.req.valid("param");
    const { operatorId, requestId } = readActor(c);
    const context = readRequestContext(c, requestId);
    const data = await endImpersonation(getPlatformPrismaClient(), {
      ticketId,
      scope: { kind: "operator", operatorId },
      endedBy: operatorId,
      actorOperatorId: operatorId,
      requestId: context.requestId,
    });
    return c.json(
      createSuccessResponseBody({ data, requestId: context.requestId }),
      200
    );
  }
);

platformImpersonationRouter.openapi(
  { ...activeRoute, middleware: readMiddleware },
  async (c) => {
    const { operatorId, requestId } = readActor(c);
    const context = readRequestContext(c, requestId);
    const items = await listActiveForOperator(
      getPlatformPrismaClient(),
      operatorId
    );
    return c.json(
      createSuccessResponseBody({
        data: { items },
        requestId: context.requestId,
      }),
      200,
      { "Cache-Control": "no-store" }
    );
  }
);

