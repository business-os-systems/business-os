import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  RATE_LIMITS,
  createSuccessResponseBody,
  problemDetailsSchema,
} from "@suite/core";
import { controlPlaneOriginGuard } from "../../middleware/control-plane-origin.js";
import { createMutationIdempotencyMiddleware } from "../../middleware/idempotency.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import {
  getControlPlaneOrigin,
  getControlWebauthnRpId,
} from "../../lib/platform-env.js";
import {
  getPlatformPrismaClient,
  getPlatformRedis,
} from "../../lib/platform-db.js";
import { PLATFORM_WEBAUTHN_RP_NAME } from "../../services/admin/platform-auth.service.js";
import { parseRegistrationResponse } from "../../services/admin/platform-webauthn-response.js";
import {
  enrolmentOptionsSchema,
  enrolmentStartBodySchema,
  enrolmentTokenResponseSchema,
  enrolmentVerifyBodySchema,
  enrolledOperatorSchema,
  OPERATOR_STATUS,
  redactEnrolmentTokenResponse,
} from "../../services/admin/operator.contract.js";
import {
  createOperatorEnrolmentService,
  type OperatorEnrolmentServiceDependencies,
} from "../../services/admin/operator.service.js";
import {
  createOperatorSelfEnrolmentService,
} from "../../services/admin/operator-self-enrolment.service.js";
import {
  envelope,
  errorResponses,
  platformValidationHook,
} from "./openapi-shared.js";
import {
  createLazyDefaultSessionGuard,
  readActor,
  readRequestId,
} from "./platform-route-shared.js";

const OPERATOR_PASSKEYS_TAG = "Platform Operator Enrolment";

const invalidInvitationResponse = {
  description: "Invitation invalid, expired or already used",
  content: { "application/problem+json": { schema: problemDetailsSchema } },
} as const;
const enrolmentErrors = { ...errorResponses, 401: invalidInvitationResponse };

const optionsRoute = createRoute({
  method: "post",
  path: "/enrolment/options",
  tags: [OPERATOR_PASSKEYS_TAG],
  summary: "Start invited-operator passkey enrolment",
  description:
    "Exchanges a single-use invitation token for WebAuthn registration options. Nothing is activated until the matching verify call succeeds.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: enrolmentStartBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Registration options",
      content: {
        "application/json": { schema: envelope(enrolmentOptionsSchema) },
      },
    },
    ...enrolmentErrors,
  },
});

const verifyRoute = createRoute({
  method: "post",
  path: "/enrolment/verify",
  tags: [OPERATOR_PASSKEYS_TAG],
  summary: "Finish invited-operator passkey enrolment",
  description:
    "Verifies the passkey, atomically marks the invitation accepted, stores the credential and activates the operator. The invitation and WebAuthn challenge are both single-use, so replay is rejected.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: enrolmentVerifyBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Operator enrolled",
      content: {
        "application/json": { schema: envelope(enrolledOperatorSchema) },
      },
    },
    ...enrolmentErrors,
  },
});

const tokenRoute = createRoute({
  method: "post",
  path: "/enrolment/token",
  tags: [OPERATOR_PASSKEYS_TAG],
  summary: "Issue a single-use add-passkey token",
  description:
    "Authenticated ACTIVE operators exchange their control session for a short-lived, single-use token bound to their operator record. The token is only a credential for the add-passkey ceremony; it does not change status or capabilities.",
  responses: {
    200: {
      description: "Enrolment token and expiry",
      content: {
        "application/json": {
          schema: envelope(enrolmentTokenResponseSchema),
        },
      },
    },
    ...enrolmentErrors,
  },
});

const addOptionsRoute = createRoute({
  method: "post",
  path: "/enrolment/add/options",
  tags: [OPERATOR_PASSKEYS_TAG],
  summary: "Start adding a passkey to an ACTIVE operator",
  description:
    "Exchanges a single-use add-passkey token for WebAuthn registration options generated with the currently configured CONTROL_WEBAUTHN_RP_ID. The token is not consumed until the matching verify call succeeds or fails.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: enrolmentStartBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Registration options",
      content: {
        "application/json": { schema: envelope(enrolmentOptionsSchema) },
      },
    },
    ...enrolmentErrors,
  },
});

const addVerifyRoute = createRoute({
  method: "post",
  path: "/enrolment/add/verify",
  tags: [OPERATOR_PASSKEYS_TAG],
  summary: "Finish adding a passkey to an ACTIVE operator",
  description:
    "Verifies the WebAuthn registration against the current RP identity, atomically consumes the single-use token, stores the new passkey and audits both the registration and the token revocation. A failed ceremony also revokes the token and audits the failure.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: enrolmentVerifyBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Passkey added",
      content: {
        "application/json": { schema: envelope(enrolledOperatorSchema) },
      },
    },
    ...enrolmentErrors,
  },
});

export const OPERATOR_PASSKEYS_RATE_LIMIT_KEY = "rl:admin:operator-passkeys";

export const platformOperatorPasskeysRouter = new OpenAPIHono({
  defaultHook: platformValidationHook,
});

const selfEnrolmentSessionGuard = createLazyDefaultSessionGuard();

platformOperatorPasskeysRouter.use(
  "*",
  rateLimitMiddleware({
    limit: RATE_LIMITS.MAX_OPERATOR_ENROLMENT_PER_MINUTE,
    windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
    keyPrefix: OPERATOR_PASSKEYS_RATE_LIMIT_KEY,
    failureMode: "closed",
  })
);
platformOperatorPasskeysRouter.use("*", controlPlaneOriginGuard);
// The session guard runs first so the idempotency scope is bound to the
// authenticated operator, exactly as the capability-gated routers do.
platformOperatorPasskeysRouter.use(
  "/enrolment/token",
  selfEnrolmentSessionGuard
);
platformOperatorPasskeysRouter.use(
  "/enrolment/token",
  createMutationIdempotencyMiddleware({
    transformStoredBody: redactEnrolmentTokenResponse,
  })
);

function webauthnConfig() {
  return {
    rpID: getControlWebauthnRpId(),
    rpName: PLATFORM_WEBAUTHN_RP_NAME,
    origin: getControlPlaneOrigin(),
  };
}

function enrolmentDependencies(): OperatorEnrolmentServiceDependencies {
  return {
    prisma: getPlatformPrismaClient(),
    redis: getPlatformRedis(),
    config: webauthnConfig(),
  };
}

platformOperatorPasskeysRouter.openapi(tokenRoute, async (c) => {
  const actor = readActor(c);
  const data = await createOperatorSelfEnrolmentService(
    enrolmentDependencies()
  ).issue({ operatorId: actor.operatorId, requestId: actor.requestId });
  return c.json(
    createSuccessResponseBody({ data, requestId: actor.requestId }),
    200
  );
});

platformOperatorPasskeysRouter.openapi(optionsRoute, async (c) => {
  const { token } = c.req.valid("json");
  const data = await createOperatorEnrolmentService(
    enrolmentDependencies()
  ).start(token);
  return c.json(
    createSuccessResponseBody({ data, requestId: readRequestId(c) }),
    200
  );
});

platformOperatorPasskeysRouter.openapi(addOptionsRoute, async (c) => {
  const { token } = c.req.valid("json");
  const data = await createOperatorSelfEnrolmentService(
    enrolmentDependencies()
  ).start({ token, requestId: readRequestId(c) });
  return c.json(
    createSuccessResponseBody({ data, requestId: readRequestId(c) }),
    200
  );
});

platformOperatorPasskeysRouter.openapi(verifyRoute, async (c) => {
  const body = c.req.valid("json");
  const enrolled = await createOperatorEnrolmentService(
    enrolmentDependencies()
  ).finish({
    token: body.token,
    flowId: body.flowId,
    response: parseRegistrationResponse(body.response),
    requestId: readRequestId(c),
  });
  const data = enrolledOperatorSchema.parse({
    id: enrolled.id,
    email: enrolled.email,
    status: OPERATOR_STATUS.ACTIVE,
    mfaEnrolled: true,
  });
  return c.json(
    createSuccessResponseBody({ data, requestId: readRequestId(c) }),
    200
  );
});

platformOperatorPasskeysRouter.openapi(addVerifyRoute, async (c) => {
  const body = c.req.valid("json");
  const enrolled = await createOperatorSelfEnrolmentService(
    enrolmentDependencies()
  ).finish({
    token: body.token,
    flowId: body.flowId,
    response: parseRegistrationResponse(body.response),
    requestId: readRequestId(c),
  });
  return c.json(
    createSuccessResponseBody({ data: enrolled, requestId: readRequestId(c) }),
    200
  );
});
