import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  PLATFORM_CAPABILITIES,
  RATE_LIMITS,
  createSuccessResponseBody,
  problemDetailsSchema,
} from "@suite/core";
import { controlPlaneOriginGuard } from "../../middleware/control-plane-origin.js";
import { createMutationIdempotencyMiddleware } from "../../middleware/idempotency.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { getControlSessionSecret } from "../../lib/platform-env.js";
import {
  getPlatformPrismaClient,
  getPlatformRedis,
} from "../../lib/platform-db.js";
import {
  changeCapabilitiesBodySchema,
  capabilitySetSchema,
  createOperatorBodySchema,
  createdOperatorSchema,
  MAX_OPERATOR_PAGE_SIZE,
  MAX_OPERATOR_SESSION_PAGE_SIZE,
  operatorIdParamsSchema,
  operatorPageSchema,
  operatorSchema,
  operatorSessionPageSchema,
  operatorSessionParamsSchema,
  redactCreatedOperatorToken,
  updateOperatorStatusBodySchema,
} from "../../services/admin/operator.contract.js";
import { createOperatorSessionService } from "../../services/admin/operator-session.service.js";
import { createAdminOperatorService } from "../../services/admin/operator.service.js";
import {
  envelope,
  errorResponses,
  platformValidationHook,
  stepUpHeaderSchema,
} from "./openapi-shared.js";
import {
  createLazyDefaultCapabilityGuard,
  readActor,
  readRequestId,
  readStepUpToken,
} from "./platform-route-shared.js";

const PLATFORM_OPERATORS = PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code;
const OPERATORS_TAG = "Platform Operators";
export const OPERATOR_RATE_LIMIT_KEY = "rl:admin:operators";
export const OPERATOR_READ_RATE_LIMIT_KEY = "rl:admin:operators:read";

const listQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(256).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_OPERATOR_PAGE_SIZE)
    .default(50),
});

const sessionListQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(256).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_OPERATOR_SESSION_PAGE_SIZE)
    .default(50),
});

const conflictResponse = {
  description: "Operator conflict",
  content: { "application/problem+json": { schema: problemDetailsSchema } },
} as const;
const notFoundResponse = {
  description: "Operator or session not found",
  content: { "application/problem+json": { schema: problemDetailsSchema } },
} as const;
const operatorErrors = {
  ...errorResponses,
  404: notFoundResponse,
  409: conflictResponse,
};

const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: [OPERATORS_TAG],
  summary: "List operators",
  description:
    "Returns operators with their active capabilities, ordered by a stable cursor.",
  request: { query: listQuerySchema },
  responses: {
    200: {
      description: "Operator page",
      content: { "application/json": { schema: envelope(operatorPageSchema) } },
    },
    ...errorResponses,
  },
});

const createRouteDefinition = createRoute({
  method: "post",
  path: "/",
  tags: [OPERATORS_TAG],
  summary: "Invite an operator",
  description:
    "Creates an INVITED operator with a single-use, time-boxed invitation. The raw token is returned once; only its hash is stored.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createOperatorBodySchema } },
    },
  },
  responses: {
    201: {
      description: "Operator invited",
      content: {
        "application/json": { schema: envelope(createdOperatorSchema) },
      },
    },
    ...operatorErrors,
  },
});

const updateRoute = createRoute({
  method: "patch",
  path: "/{operatorId}",
  tags: [OPERATORS_TAG],
  summary: "Suspend, restore or revoke an operator",
  description:
    "Changes status with a recorded reason. Suspension and revocation revoke every live session; the last operator able to manage operators cannot be demoted.",
  request: {
    params: operatorIdParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateOperatorStatusBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Operator updated",
      content: { "application/json": { schema: envelope(operatorSchema) } },
    },
    ...operatorErrors,
  },
});

const capabilitiesRoute = createRoute({
  method: "patch",
  path: "/{operatorId}/capabilities",
  tags: [OPERATORS_TAG],
  summary: "Grant or revoke operator capabilities",
  description:
    "Applies explicit grants and revocations in one transaction after consuming a fresh single-use x-step-up-token, writes the audit row, and invalidates the capability cache. Revoking operator management is blocked for the last manager.",
  request: {
    params: operatorIdParamsSchema,
    headers: stepUpHeaderSchema,
    body: {
      required: true,
      content: {
        "application/json": { schema: changeCapabilitiesBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Active capabilities after the change",
      content: { "application/json": { schema: envelope(capabilitySetSchema) } },
    },
    ...operatorErrors,
  },
});

const sessionsRoute = createRoute({
  method: "get",
  path: "/{operatorId}/sessions",
  tags: [OPERATORS_TAG],
  summary: "List operator sessions",
  description:
    "Returns control sessions with their issued, idle and expiry times and revocation state.",
  request: { params: operatorIdParamsSchema, query: sessionListQuerySchema },
  responses: {
    200: {
      description: "Session page",
      content: {
        "application/json": { schema: envelope(operatorSessionPageSchema) },
      },
    },
    ...errorResponses,
  },
});

const revokeSessionRoute = createRoute({
  method: "delete",
  path: "/{operatorId}/sessions/{sessionId}",
  tags: [OPERATORS_TAG],
  summary: "Revoke one operator session",
  description:
    "Marks the session revoked immediately and records the revocation in the audit chain.",
  request: { params: operatorSessionParamsSchema },
  responses: {
    204: { description: "Session revoked" },
    ...operatorErrors,
  },
});

export const platformOperatorsRouter = new OpenAPIHono({
  defaultHook: platformValidationHook,
});

const operatorReadLimiter = rateLimitMiddleware({
  limit: RATE_LIMITS.MAX_OPERATOR_READS_PER_MINUTE,
  windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
  keyPrefix: OPERATOR_READ_RATE_LIMIT_KEY,
  failureMode: "closed",
  methods: ["GET", "HEAD"],
});

const operatorMutationLimiter = rateLimitMiddleware({
  limit: RATE_LIMITS.MAX_OPERATOR_MUTATIONS_PER_MINUTE,
  windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
  keyPrefix: OPERATOR_RATE_LIMIT_KEY,
  failureMode: "closed",
  methods: ["POST", "PATCH", "DELETE", "OPTIONS"],
});

// Reads drive the list, the record lookup and the session panel; the mutation
// budget stays much smaller so a read burst cannot exhaust a status change.
platformOperatorsRouter.use("*", operatorReadLimiter);
platformOperatorsRouter.use("*", operatorMutationLimiter);

// The control-plane origin check runs before any cookie-authenticated mutation
// can reach the capability guard (CSRF defence; tenant origins share the site).
platformOperatorsRouter.use("*", controlPlaneOriginGuard);

const operatorCapabilityGuard = createLazyDefaultCapabilityGuard(() => ({
  prisma: getPlatformPrismaClient(),
  secret: getControlSessionSecret(),
  capability: PLATFORM_OPERATORS,
}));

platformOperatorsRouter.use("*", operatorCapabilityGuard);

// The capability guard runs first so the idempotency scope is bound to the
// authenticated operator. Reads do not require a key (CT-4).
platformOperatorsRouter.use(
  "*",
  createMutationIdempotencyMiddleware({
    transformStoredBody: redactCreatedOperatorToken,
  })
);

let operatorService: ReturnType<typeof createAdminOperatorService> | null = null;
let operatorSessionService: ReturnType<
  typeof createOperatorSessionService
> | null = null;

function sessions(): ReturnType<typeof createOperatorSessionService> {
  operatorSessionService ??= createOperatorSessionService(
    getPlatformPrismaClient()
  );
  return operatorSessionService;
}

function operators(): ReturnType<typeof createAdminOperatorService> {
  operatorService ??= createAdminOperatorService({
    prisma: getPlatformPrismaClient(),
    redis: getPlatformRedis(),
  });
  return operatorService;
}

platformOperatorsRouter.openapi(listRoute, async (c) => {
  const query = c.req.valid("query");
  const data = await operators().list({
    cursor: query.cursor,
    limit: query.limit,
  });
  return c.json(
    createSuccessResponseBody({ data, requestId: readRequestId(c) }),
    200
  );
});

platformOperatorsRouter.openapi(createRouteDefinition, async (c) => {
  const body = c.req.valid("json");
  const data = await operators().create(body, readActor(c));
  return c.json(
    createSuccessResponseBody({ data, requestId: readRequestId(c) }),
    201
  );
});

platformOperatorsRouter.openapi(updateRoute, async (c) => {
  const { operatorId } = c.req.valid("param");
  const body = c.req.valid("json");
  const data = await operators().updateStatus({
    operatorId,
    status: body.status,
    expectedStatus: body.expectedStatus,
    reason: body.reason,
    actor: readActor(c),
  });
  return c.json(
    createSuccessResponseBody({ data, requestId: readRequestId(c) }),
    200
  );
});

platformOperatorsRouter.openapi(capabilitiesRoute, async (c) => {
  const { operatorId } = c.req.valid("param");
  const body = c.req.valid("json");
  const capabilities = await operators().changeCapabilities({
    operatorId,
    grant: body.grant,
    revoke: body.revoke,
    actor: readActor(c),
    stepUpToken: readStepUpToken(c),
  });
  return c.json(
    createSuccessResponseBody({
      data: { capabilities: [...capabilities] },
      requestId: readRequestId(c),
    }),
    200
  );
});

platformOperatorsRouter.openapi(sessionsRoute, async (c) => {
  const { operatorId } = c.req.valid("param");
  const query = c.req.valid("query");
  const data = await sessions().list({
    operatorId,
    cursor: query.cursor,
    limit: query.limit,
  });
  return c.json(
    createSuccessResponseBody({ data, requestId: readRequestId(c) }),
    200
  );
});

platformOperatorsRouter.openapi(revokeSessionRoute, async (c) => {
  const { operatorId, sessionId } = c.req.valid("param");
  await sessions().revoke({
    operatorId,
    sessionId,
    actor: readActor(c),
  });
  return c.body(null, 204);
});
