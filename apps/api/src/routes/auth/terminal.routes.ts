import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import {
  configureManagerOverridePin,
  configureTerminalPin,
  verifyManagerOverride,
  verifyTerminalSwitch,
} from "../../services/auth/terminal-pin.service.js";
import {
  problemDetailsResponseSchema,
  readJsonBody,
  successBody,
} from "./shared.js";

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

const setManagerOverridePinSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  newManagerPin: z.string().regex(/^\d{4,8}$/, "Manager PIN must be 4 to 8 numeric digits"),
});

const verifyManagerOverrideSchema = z.object({
  managerPin: z.string().regex(/^\d{4,8}$/, "Manager PIN must be 4 to 8 numeric digits"),
  action: z.string().min(3).max(64),
  targetEntityId: z.string().min(1, "Target entity ID is required"),
  reason: z.string().min(5).max(255),
  organizationId: z.string().min(1, "Organization ID is required"),
  managerUserId: z.string().optional(),
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

const verifyManagerOverrideRoute = createRoute({
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

export function registerManagerOverrideRoutes(router: OpenAPIHono): void {
  router.openapi(verifyManagerOverrideRoute, async (c) => {
    const result = await verifyManagerOverride(c.req.valid("json"));
    return c.json(successBody(c.get("requestId"), result), 200);
  });
}

export function registerTerminalPinRoutes(router: OpenAPIHono): void {
  router.post("/terminal/pin-switch", async (c) => {
    const body = await readJsonBody(c, {
      schema: terminalPinSwitchSchema,
      detail: "Invalid terminal PIN switch payload",
    });
    const result = await verifyTerminalSwitch({
      pin: body.terminalPin,
      organizationId: body.organizationId,
      terminalKey: body.terminalKey,
      branchId: body.branchId,
    });
    return c.json(successBody(c.get("requestId"), result));
  });

  router.post("/terminal/pin-set", async (c) => {
    const body = await readJsonBody(c, {
      schema: setTerminalPinSchema,
      detail: "Invalid PIN configuration payload",
    });
    const result = await configureTerminalPin({
      userId: body.userId,
      organizationId: body.organizationId,
      newPin: body.newPin,
    });
    return c.json(successBody(c.get("requestId"), result));
  });

  router.post("/manager-override/pin-set", async (c) => {
    const body = await readJsonBody(c, {
      schema: setManagerOverridePinSchema,
      detail: "Invalid manager PIN configuration payload",
    });
    const result = await configureManagerOverridePin({
      userId: body.userId,
      newManagerPin: body.newManagerPin,
    });
    return c.json(successBody(c.get("requestId"), result));
  });
}

export function registerTerminalRoutes(router: OpenAPIHono): void {
  registerManagerOverrideRoutes(router);
  registerTerminalPinRoutes(router);
}
