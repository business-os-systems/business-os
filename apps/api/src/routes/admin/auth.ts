import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import { UnauthorizedError } from "@suite/core/errors";
import { createSuccessResponseBody } from "@suite/core";
import { AUTH_ERROR_CODES } from "@suite/auth";
import {
  platformSessionViewSchema,
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

const SessionDataSchema = platformSessionViewSchema;

const BootstrapOptionsDataSchema = z.object({
  flowId: z.string(),
  options: z.record(z.unknown()),
  email: z.string(),
});

const SignInOptionsDataSchema = z.object({
  flowId: z.string(),
  options: z.record(z.unknown()),
});

const successSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    success: z.literal(true),
    data,
    requestId: z.string(),
    timestamp: z.string(),
  });

const SessionResponseSchema = successSchema(SessionDataSchema);
const BootstrapOptionsResponseSchema = successSchema(BootstrapOptionsDataSchema);
const SignInOptionsResponseSchema = successSchema(SignInOptionsDataSchema);
const VerifyResponseSchema = successSchema(SessionDataSchema);

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

function requestContext(c: {
  get: (key: string) => unknown;
  req: { header: (name: string) => string | undefined };
}): {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
} {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    requestId:
      typeof c.get("requestId") === "string"
        ? (c.get("requestId") as string)
        : "unknown",
    ip:
      c.req.header("cf-connecting-ip")?.trim() ??
      forwarded ??
      c.req.header("x-real-ip")?.trim() ??
      null,
    userAgent: c.req.header("user-agent") ?? null,
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
platformAuthRouter.use("*", authRouteRateLimit);
platformAuthRouter.use("/bootstrap/*", webauthnRateLimit);
platformAuthRouter.use("/sign-in/*", webauthnRateLimit);
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
