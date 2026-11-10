import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import { UnauthorizedError } from "@suite/core/errors";
import { createSuccessResponseBody } from "@suite/core";
import { AUTH_ERROR_CODES } from "@suite/auth";
import {
  RATE_LIMITS,
  platformBootstrapOptionsSchema,
  platformSessionViewSchema,
  platformSignInOptionsSchema,
  problemDetailsSchema,
} from "@suite/core";
import {
  CONTROL_SESSION_COOKIE_NAME,
  createControlSessionCookieOptions,
  type IssuedControlSession,
} from "@suite/auth/platform";
import {
  finishBootstrap,
  finishSignIn,
  finishStepUp,
  getSession,
  logout,
  startBootstrap,
  startSignIn,
  type PlatformSession,
} from "../../services/admin/platform-auth.service.js";
import { platformAuthDependencies } from "../../services/admin/platform-auth-dependencies.service.js";
import {
  parseAuthenticationResponse,
  parseRegistrationResponse,
} from "../../services/admin/platform-webauthn-response.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { controlPlaneOriginGuard } from "../../middleware/control-plane-origin.js";
import { resolveClientIp } from "../../lib/client-ip.js";
import { envelope } from "./openapi-shared.js";

const MAXIMUM_USER_AGENT_LENGTH = 512;

const SessionDataSchema = platformSessionViewSchema;

const SessionResponseSchema = envelope(SessionDataSchema);
const BootstrapOptionsResponseSchema = envelope(
  platformBootstrapOptionsSchema,
);
const SignInOptionsResponseSchema = envelope(platformSignInOptionsSchema);
const VerifyResponseSchema = envelope(SessionDataSchema);
const StepUpConfirmSchema = z
  .object({
    token: z.string().min(1),
    expiresAt: z.string().datetime(),
  })
  .strict();
const StepUpConfirmResponseSchema = envelope(StepUpConfirmSchema);

const BootstrapOptionsBody = z.object({ token: z.string().min(1) });
const BootstrapVerifyBody = z.object({
  token: z.string().min(1),
  flowId: z.string().min(1),
  response: z.unknown(),
});
const SignInVerifyBody = z.object({
  flowId: z.string().min(1),
  response: z.unknown(),
});
const StepUpVerifyBody = z.object({
  flowId: z.string().min(1),
  response: z.unknown(),
});

const errorResponses = {
  401: {
    description: "Authentication required",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  403: {
    description: "Origin or permission denied",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  422: {
    description: "Invalid request",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
};

function requestContext(c: Context): {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
} {
  const requestId = c.get("requestId");
  return {
    requestId: typeof requestId === "string" ? requestId : "unknown",
    ip: resolveClientIp(c),
    userAgent:
      c.req.header("user-agent")?.slice(0, MAXIMUM_USER_AGENT_LENGTH) ?? null,
  };
}

function writeSessionCookie(
  c: Parameters<MiddlewareHandler>[0],
  session: IssuedControlSession
): void {
  const options = createControlSessionCookieOptions();
  setCookie(c, options.name, session.token, {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
    maxAge: options.maxAge,
  });
}

function clearSessionCookie(c: Parameters<MiddlewareHandler>[0]): void {
  const options = createControlSessionCookieOptions();
  deleteCookie(c, options.name, {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
  });
}

function sessionView(
  operator: PlatformSession["operator"],
  capabilities: PlatformSession["capabilities"]
): z.infer<typeof SessionDataSchema> {
  return {
    operator,
    capabilities: [...capabilities],
  };
}

function success<T>(c: Parameters<MiddlewareHandler>[0], data: T) {
  return c.json(
    createSuccessResponseBody({
      data,
      requestId: requestContext(c).requestId,
    }),
    200
  );
}

const bootstrapOptionsRoute = createRoute({
  method: "post",
  path: "/bootstrap/options",
  tags: ["Platform Auth"],
  summary: "Start first-operator passkey registration",
  request: {
    body: {
      content: { "application/json": { schema: BootstrapOptionsBody } },
    },
  },
  responses: {
    200: {
      description: "Registration options",
      content: { "application/json": { schema: BootstrapOptionsResponseSchema } },
    },
    ...errorResponses,
  },
});

const bootstrapVerifyRoute = createRoute({
  method: "post",
  path: "/bootstrap/verify",
  tags: ["Platform Auth"],
  summary: "Finish first-operator passkey registration",
  request: {
    body: {
      content: { "application/json": { schema: BootstrapVerifyBody } },
    },
  },
  responses: {
    200: {
      description: "Operator signed in",
      content: { "application/json": { schema: VerifyResponseSchema } },
    },
    ...errorResponses,
  },
});

const signInOptionsRoute = createRoute({
  method: "post",
  path: "/sign-in/options",
  tags: ["Platform Auth"],
  summary: "Start passkey sign-in",
  responses: {
    200: {
      description: "Authentication options",
      content: { "application/json": { schema: SignInOptionsResponseSchema } },
    },
    ...errorResponses,
  },
});

const signInVerifyRoute = createRoute({
  method: "post",
  path: "/sign-in/verify",
  tags: ["Platform Auth"],
  summary: "Finish passkey sign-in",
  request: {
    body: {
      content: { "application/json": { schema: SignInVerifyBody } },
    },
  },
  responses: {
    200: {
      description: "Operator signed in",
      content: { "application/json": { schema: VerifyResponseSchema } },
    },
    ...errorResponses,
  },
});

const stepUpVerifyRoute = createRoute({
  method: "post",
  path: "/step-up/verify",
  tags: ["Platform Auth"],
  summary: "Confirm the operator with a fresh passkey assertion",
  description:
    "Exchanges a fresh WebAuthn assertion for one single-use step-up token (FR-046). The assertion must resolve to a passkey owned by the signed-in operator and must answer a challenge started by POST /sign-in/options. The response token travels as x-step-up-token on destructive Platform mutations and expires after five minutes; it is never stored in a cookie. Refusals write OPERATOR_STEP_UP_FAILED and successes write OPERATOR_STEP_UP_VERIFIED. Both the challenge and the token are single-use.",
  request: {
    body: {
      content: { "application/json": { schema: StepUpVerifyBody } },
    },
  },
  responses: {
    200: {
      description: "Single-use step-up token",
      content: {
        "application/json": { schema: StepUpConfirmResponseSchema },
      },
    },
    ...errorResponses,
  },
});

const meRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["Platform Auth"],
  summary: "Read the current Platform operator",
  responses: {
    200: {
      description: "Current operator and capabilities",
      content: { "application/json": { schema: SessionResponseSchema } },
    },
    ...errorResponses,
  },
});

const logoutRoute = createRoute({
  method: "post",
  path: "/logout",
  tags: ["Platform Auth"],
  summary: "Revoke the control session",
  responses: {
    204: { description: "Signed out" },
    ...errorResponses,
  },
});

export const platformAuthRouter = new OpenAPIHono();

const authRouteRateLimit = rateLimitMiddleware({
  limit: 120,
  windowSeconds: 60,
  keyPrefix: "rl:platform:auth:route",
  failureMode: "closed",
});
const webauthnRateLimit = rateLimitMiddleware({
  limit: 20,
  windowSeconds: 60,
  keyPrefix: "rl:platform:auth:webauthn",
  failureMode: "closed",
});
const stepUpRateLimit = rateLimitMiddleware({
  limit: RATE_LIMITS.MAX_STEP_UP_ATTEMPTS_PER_MINUTE,
  windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
  keyPrefix: "rl:platform:auth:step-up",
  failureMode: "closed",
});
platformAuthRouter.use("*", authRouteRateLimit);
platformAuthRouter.use("/bootstrap/*", webauthnRateLimit);
platformAuthRouter.use("/sign-in/*", webauthnRateLimit);
platformAuthRouter.use("/step-up/*", stepUpRateLimit);
platformAuthRouter.use("*", controlPlaneOriginGuard);

platformAuthRouter.openapi(bootstrapOptionsRoute, async (c) => {
  const { token } = c.req.valid("json");
  const result = await startBootstrap(platformAuthDependencies(), token);
  return success(c, {
    flowId: result.flowId,
    options: z.record(z.string(), z.unknown()).parse(result.options),
    email: result.email,
  });
});

platformAuthRouter.openapi(bootstrapVerifyRoute, async (c) => {
  const body = c.req.valid("json");
  const session = await finishBootstrap(platformAuthDependencies(), {
    token: body.token,
    flowId: body.flowId,
    response: parseRegistrationResponse(body.response),
    ...requestContext(c),
  });
  writeSessionCookie(c, session.session);
  return success(c, sessionView(session.operator, session.capabilities));
});

platformAuthRouter.openapi(signInOptionsRoute, async (c) => {
  const result = await startSignIn(platformAuthDependencies());
  return success(c, {
    flowId: result.flowId,
    options: z.record(z.string(), z.unknown()).parse(result.options),
  });
});

platformAuthRouter.openapi(signInVerifyRoute, async (c) => {
  const body = c.req.valid("json");
  const session = await finishSignIn(platformAuthDependencies(), {
    flowId: body.flowId,
    response: parseAuthenticationResponse(body.response),
    ...requestContext(c),
  });
  writeSessionCookie(c, session.session);
  return success(c, sessionView(session.operator, session.capabilities));
});

platformAuthRouter.openapi(stepUpVerifyRoute, async (c) => {
  const sessionToken = getCookie(c, CONTROL_SESSION_COOKIE_NAME);
  if (!sessionToken) {
    throw new UnauthorizedError("Authentication required.", {
      code: AUTH_ERROR_CODES.AUTH_REQUIRED,
    });
  }
  const body = c.req.valid("json");
  const confirmation = await finishStepUp(platformAuthDependencies(), {
    sessionToken,
    flowId: body.flowId,
    response: parseAuthenticationResponse(body.response),
    requestId: requestContext(c).requestId,
  });
  return c.json(
    createSuccessResponseBody({
      data: confirmation,
      requestId: requestContext(c).requestId,
    }),
    200,
    { "Cache-Control": "no-store" }
  );
});

platformAuthRouter.openapi(meRoute, async (c) => {
  const token = getCookie(c, CONTROL_SESSION_COOKIE_NAME);
  if (!token) {
    throw new UnauthorizedError("Authentication required.", {
      code: AUTH_ERROR_CODES.AUTH_REQUIRED,
    });
  }
  const session = await getSession(platformAuthDependencies(), token);
  return success(c, sessionView(session.operator, session.capabilities));
});

platformAuthRouter.openapi(logoutRoute, async (c) => {
  const token = getCookie(c, CONTROL_SESSION_COOKIE_NAME) ?? null;
  await logout(platformAuthDependencies(), {
    token,
    requestId: requestContext(c).requestId,
  });
  clearSessionCookie(c);
  return c.body(null, 204);
});
