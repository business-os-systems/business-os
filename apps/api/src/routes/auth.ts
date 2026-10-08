import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { type Context } from "hono";
import { prisma } from "@suite/db";
import {
  switchActiveBranch,
  verifyTerminalPin,
  setTerminalPin,
  verifyManagerOverridePin,
  setManagerOverridePin,
  resolveSsoProviderByEmail,
  extractTokenFromHeader,
  extractTokenFromCookie,
  UnauthorizedError,
  ValidationError,
} from "@suite/auth";

export const authRouter = new OpenAPIHono({
  defaultHook: (result, _c) => {
    if (!result.success) {
      throw new ValidationError(
        "Invalid request parameters",
        result.error.errors.map((e) => ({
          name: e.path.join("."),
          reason: e.message,
        }))
      );
    }
  },
});

const switchBranchSchema = z.object({
  branchId: z.string().min(1, "Branch ID is required"),
});

const terminalPinSwitchSchema = z.object({
  terminalPin: z.string().regex(/^\d{4,6}$/, "Terminal PIN must be 4 to 6 numeric digits"),
  organizationId: z.string().min(1, "Organization ID is required"),
  terminalKey: z.string().optional(),
  branchId: z.string().nullable().optional(),
});

const setTerminalPinSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  organizationId: z.string().min(1, "Organization ID is required"),
  newPin: z.string().regex(/^\d{4,6}$/, "Terminal PIN must be 4 to 6 numeric digits"),
});

const verifyManagerOverrideSchema = z.object({
  managerPin: z.string().regex(/^\d{4,8}$/, "Manager PIN must be 4 to 8 numeric digits"),
  action: z.string().min(3).max(64),
  targetEntityId: z.string().min(1, "Target entity ID is required"),
  reason: z.string().min(5).max(255),
  organizationId: z.string().min(1, "Organization ID is required"),
});

const setManagerOverridePinSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  newManagerPin: z.string().regex(/^\d{4,8}$/, "Manager PIN must be 4 to 8 numeric digits"),
});

const ssoDiscoverSchema = z.object({
  email: z.string().email("Valid corporate email required"),
});

const problemDetailsResponseSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  detail: z.string(),
  instance: z.string().optional(),
  code: z.string().optional(),
  requestId: z.string().optional(),
  timestamp: z.string().optional(),
});

const switchBranchSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    activeOrganizationId: z.string(),
    activeBranchId: z.string(),
    branch: z.object({
      id: z.string(),
      name: z.string(),
      code: z.string(),
      type: z.string(),
      timezone: z.string(),
      currency: z.string(),
      locale: z.string(),
    }),
    effectiveRoles: z.array(z.string()),
    permissions: z.array(z.string()),
  }),
});

const managerOverrideSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    verified: z.literal(true),
    managerUserId: z.string(),
    managerName: z.string(),
    overrideToken: z.string(),
    expiresAt: z.string(),
  }),
  requestId: z.string(),
  timestamp: z.string(),
});

const ssoDiscoverySuccessSchema = z.object({
  success: z.literal(true),
  data: z
    .object({
      domain: z.string(),
      providerType: z.string().nullable(),
      enforceSso: z.boolean(),
      organizationId: z.string().nullable(),
      organizationName: z.string().nullable(),
      organizationSlug: z.string().nullable(),
      authUrl: z.string().nullable(),
      defaultRoleId: z.string().nullable().optional(),
    })
    .nullable(),
  requestId: z.string(),
  timestamp: z.string(),
});

function getSessionToken(c: Context): string {
  const authHeader = c.req.header("Authorization");
  const cookieHeader = c.req.header("Cookie");
  const token = extractTokenFromHeader(authHeader) || extractTokenFromCookie(cookieHeader);

  if (!token) {
    throw new UnauthorizedError("Authentication required. Missing session token.", {
      code: "AUTH_UNAUTHORIZED",
    });
  }

  return token;
}

export const switchBranchRoute = createRoute({
  method: "post",
  path: "/switch-branch",
  tags: ["Identity, Sessions & Auth"],
  summary: "Switch active operational branch",
  description: "Switches the user's active operational branch context within their session, verifying user branch role membership.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: switchBranchSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: switchBranchSuccessSchema,
        },
      },
      description: "Active branch switched successfully.",
    },
    401: {
      content: {
        "application/problem+json": {
          schema: problemDetailsResponseSchema,
        },
      },
      description: "Unauthorized or missing session token.",
    },
  },
});

export const verifyManagerOverrideRoute = createRoute({
  method: "post",
  path: "/manager-override/verify",
  tags: ["Identity, Sessions & Auth"],
  summary: "Verify manager anti-theft override PIN",
  description: "Validates a 4-8 digit manager PIN for high-risk operations (refunds, voids, discounts) and returns a 60-second HMAC token.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: verifyManagerOverrideSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: managerOverrideSuccessSchema,
        },
      },
      description: "Manager override authorized with temporary HMAC token.",
    },
    401: {
      content: {
        "application/problem+json": {
          schema: problemDetailsResponseSchema,
        },
      },
      description: "Invalid manager PIN or insufficient permissions.",
    },
  },
});

export const ssoDiscoverRoute = createRoute({
  method: "post",
  path: "/sso/discover",
  tags: ["Identity, Sessions & Auth"],
  summary: "Discover enterprise SSO by domain",
  description: "Resolves corporate email domain to determine if tenant uses Google Workspace, Microsoft Entra, or SAML 2.0.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: ssoDiscoverSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ssoDiscoverySuccessSchema,
        },
      },
      description: "SSO discovery result returned.",
    },
  },
});

authRouter.openapi(switchBranchRoute, async (c) => {
  const token = getSessionToken(c);
  const { branchId } = c.req.valid("json");

  const result = await switchActiveBranch({
    sessionToken: token,
    branchId,
    prisma,
  });

  return c.json(result, 200);
});

authRouter.openapi(verifyManagerOverrideRoute, async (c) => {
  const body = c.req.valid("json");
  const secretKey =
    process.env.BETTER_AUTH_SECRET ||
    "suite-default-manager-override-secret-key-32-chars";

  const result = await verifyManagerOverridePin({
    managerPin: body.managerPin,
    action: body.action,
    targetEntityId: body.targetEntityId,
    reason: body.reason,
    organizationId: body.organizationId,
    secretKey,
    prisma,
  });

  return c.json(
    {
      success: true as const,
      data: result,
      requestId: c.get("requestId") || "req_unknown",
      timestamp: new Date().toISOString(),
    },
    200
  );
});

authRouter.openapi(ssoDiscoverRoute, async (c) => {
  const { email } = c.req.valid("json");
  const discovery = await resolveSsoProviderByEmail(email, prisma);

  return c.json(
    {
      success: true as const,
      data: discovery,
      requestId: c.get("requestId") || "req_unknown",
      timestamp: new Date().toISOString(),
    },
    200
  );
});

authRouter.post("/terminal/pin-switch", async (c) => {
  const rawBody = await c.req.json().catch(() => ({}));
  const parseResult = terminalPinSwitchSchema.safeParse(rawBody);

  if (!parseResult.success) {
    throw new ValidationError(
      "Invalid terminal PIN switch payload",
      parseResult.error.errors.map((e) => ({
        name: e.path.join("."),
        reason: e.message,
      }))
    );
  }

  const result = await verifyTerminalPin({
    pin: parseResult.data.terminalPin,
    organizationId: parseResult.data.organizationId,
    terminalKey: parseResult.data.terminalKey,
    branchId: parseResult.data.branchId,
    prisma,
  });

  return c.json({
    success: true,
    data: result,
    requestId: c.get("requestId") || "req_unknown",
    timestamp: new Date().toISOString(),
  });
});

authRouter.post("/terminal/pin-set", async (c) => {
  const rawBody = await c.req.json().catch(() => ({}));
  const parseResult = setTerminalPinSchema.safeParse(rawBody);

  if (!parseResult.success) {
    throw new ValidationError(
      "Invalid PIN configuration payload",
      parseResult.error.errors.map((e) => ({
        name: e.path.join("."),
        reason: e.message,
      }))
    );
  }

  const result = await setTerminalPin({
    userId: parseResult.data.userId,
    organizationId: parseResult.data.organizationId,
    newPin: parseResult.data.newPin,
    prisma,
  });

  return c.json({
    success: true,
    data: result,
    requestId: c.get("requestId") || "req_unknown",
    timestamp: new Date().toISOString(),
  });
});

authRouter.post("/manager-override/pin-set", async (c) => {
  const rawBody = await c.req.json().catch(() => ({}));
  const parseResult = setManagerOverridePinSchema.safeParse(rawBody);

  if (!parseResult.success) {
    throw new ValidationError(
      "Invalid manager PIN configuration payload",
      parseResult.error.errors.map((e) => ({
        name: e.path.join("."),
        reason: e.message,
      }))
    );
  }

  const result = await setManagerOverridePin({
    userId: parseResult.data.userId,
    newManagerPin: parseResult.data.newManagerPin,
    prisma,
  });

  return c.json({
    success: true,
    data: result,
    requestId: c.get("requestId") || "req_unknown",
    timestamp: new Date().toISOString(),
  });
});
