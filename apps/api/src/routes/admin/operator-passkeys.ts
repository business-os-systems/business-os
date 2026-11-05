import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  RATE_LIMITS,
  createSuccessResponseBody,
  problemDetailsSchema,
} from "@suite/core";
import { controlPlaneOriginGuard } from "../../middleware/control-plane-origin.js";
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
  enrolmentVerifyBodySchema,
  enrolledOperatorSchema,
  OPERATOR_STATUS,
} from "../../services/admin/operator.contract.js";
import {
  createOperatorEnrolmentService,
  type OperatorEnrolmentServiceDependencies,
} from "../../services/admin/operator.service.js";
import {
  envelope,
  errorResponses,
  platformValidationHook,
} from "./openapi-shared.js";
import { readRequestId } from "./platform-route-shared.js";

const invalidInvitationResponse = {
  description: "Invitation invalid, expired or already used",
  content: { "application/problem+json": { schema: problemDetailsSchema } },
} as const;
const enrolmentErrors = { ...errorResponses, 401: invalidInvitationResponse };

const optionsRoute = createRoute({
  method: "post",
  path: "/enrolment/options",
  tags: ["Platform Operator Enrolment"],
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
  tags: ["Platform Operator Enrolment"],
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

export const platformOperatorPasskeysRouter = new OpenAPIHono({
  defaultHook: platformValidationHook,
});

platformOperatorPasskeysRouter.use(
  "*",
  rateLimitMiddleware({
    limit: RATE_LIMITS.MAX_OPERATOR_ENROLMENT_PER_MINUTE,
    windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
    keyPrefix: "rl:admin:operator-passkeys",
    failureMode: "closed",
  })
);
platformOperatorPasskeysRouter.use("*", controlPlaneOriginGuard);

function dependencies(): OperatorEnrolmentServiceDependencies {
  return {
    prisma: getPlatformPrismaClient(),
    redis: getPlatformRedis(),
    config: {
      rpID: getControlWebauthnRpId(),
      rpName: PLATFORM_WEBAUTHN_RP_NAME,
      origin: getControlPlaneOrigin(),
    },
  };
}

platformOperatorPasskeysRouter.openapi(optionsRoute, async (c) => {
  const { token } = c.req.valid("json");
  const data = await createOperatorEnrolmentService(dependencies()).start(token);
  return c.json(
    createSuccessResponseBody({ data, requestId: readRequestId(c) }),
    200
  );
});

platformOperatorPasskeysRouter.openapi(verifyRoute, async (c) => {
  const body = c.req.valid("json");
  const enrolled = await createOperatorEnrolmentService(dependencies()).finish({
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
