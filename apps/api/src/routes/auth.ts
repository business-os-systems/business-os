import { Hono, type Context } from "hono";
import { z } from "zod";
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

export const authRouter = new Hono();

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

/**
 * POST /api/v1/auth/switch-branch
 * Switches the active branch operational unit for the current authenticated user session.
 */
authRouter.post("/switch-branch", async (c) => {
  const token = getSessionToken(c);
  const rawBody = await c.req.json().catch(() => ({}));
  const parseResult = switchBranchSchema.safeParse(rawBody);

  if (!parseResult.success) {
    throw new ValidationError(
      "Invalid branch switch payload",
      parseResult.error.errors.map((e) => ({
        name: e.path.join("."),
        reason: e.message,
      }))
    );
  }

  const result = await switchActiveBranch({
    sessionToken: token,
    branchId: parseResult.data.branchId,
    prisma,
  });

  return c.json(result);
});

/**
 * POST /api/v1/auth/terminal/pin-switch
 * Fast shift staff context switch on shared counter/POS devices.
 */
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

/**
 * POST /api/v1/auth/terminal/pin-set
 * Sets or updates the 4-6 digit shift-switch PIN for an authenticated staff member.
 */
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

/**
 * POST /api/v1/auth/manager-override/verify
 * Verifies a manager PIN for privileged anti-theft operations, minting a 60-second HMAC token.
 */
authRouter.post("/manager-override/verify", async (c) => {
  const rawBody = await c.req.json().catch(() => ({}));
  const parseResult = verifyManagerOverrideSchema.safeParse(rawBody);

  if (!parseResult.success) {
    throw new ValidationError(
      "Invalid manager override payload",
      parseResult.error.errors.map((e) => ({
        name: e.path.join("."),
        reason: e.message,
      }))
    );
  }

  const secretKey =
    process.env.BETTER_AUTH_SECRET ||
    "suite-default-manager-override-secret-key-32-chars";

  const result = await verifyManagerOverridePin({
    managerPin: parseResult.data.managerPin,
    action: parseResult.data.action,
    targetEntityId: parseResult.data.targetEntityId,
    reason: parseResult.data.reason,
    organizationId: parseResult.data.organizationId,
    secretKey,
    prisma,
  });

  return c.json({
    success: true,
    data: result,
    requestId: c.get("requestId") || "req_unknown",
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/auth/manager-override/pin-set
 * Sets or rotates the manager financial override PIN.
 */
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

/**
 * POST /api/v1/auth/sso/discover
 * Public enterprise domain discovery endpoint routing employees to configured IdPs.
 */
authRouter.post("/sso/discover", async (c) => {
  const rawBody = await c.req.json().catch(() => ({}));
  const parseResult = ssoDiscoverSchema.safeParse(rawBody);

  if (!parseResult.success) {
    throw new ValidationError(
      "Invalid email address for SSO discovery",
      parseResult.error.errors.map((e) => ({
        name: e.path.join("."),
        reason: e.message,
      }))
    );
  }

  const discovery = await resolveSsoProviderByEmail(parseResult.data.email, prisma);

  return c.json({
    success: true,
    data: discovery,
    requestId: c.get("requestId") || "req_unknown",
    timestamp: new Date().toISOString(),
  });
});
