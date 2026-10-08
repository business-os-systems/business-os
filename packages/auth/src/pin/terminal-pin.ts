import type { PrismaClient } from "@suite/db";
import { UnauthorizedError, ValidationError, RateLimitError } from "@suite/core/errors";
import { hashPin, verifyPin } from "./pin-engine.js";

/**
 * Terminal Rate Limiter configuration:
 * - Max 5 attempts
 * - 15 minutes lockout window (900,000 ms)
 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

interface AttemptRecord {
  count: number;
  lockedUntil?: number;
}

const terminalAttemptStore = new Map<string, AttemptRecord>();

export function clearTerminalRateLimit(key: string): void {
  terminalAttemptStore.delete(key);
}

export function clearAllTerminalRateLimits(): void {
  terminalAttemptStore.clear();
}

function checkAndRecordRateLimit(key: string): void {
  const now = Date.now();
  const record = terminalAttemptStore.get(key);

  if (record?.lockedUntil && record.lockedUntil > now) {
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    throw new RateLimitError(
      `Terminal PIN switch locked due to excessive failed attempts. Try again in ${remainingSeconds} seconds.`,
      remainingSeconds,
      {
        code: "AUTH_PIN_LOCKED",
      }
    );
  }
}

function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const record = terminalAttemptStore.get(key) || { count: 0 };
  record.count += 1;

  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_WINDOW_MS;
    terminalAttemptStore.set(key, record);
    const retrySeconds = Math.ceil(LOCKOUT_WINDOW_MS / 1000);
    throw new RateLimitError(
      "Terminal PIN switch locked after 5 failed attempts. Please wait 15 minutes or contact an administrator.",
      retrySeconds,
      {
        code: "AUTH_PIN_LOCKED",
      }
    );
  } else {
    terminalAttemptStore.set(key, record);
  }
}

export interface VerifyTerminalPinParams {
  pin: string;
  organizationId: string;
  terminalKey?: string;
  branchId?: string | null;
  prisma: PrismaClient;
}

export interface SwitchedTerminalUser {
  switchedUserId: string;
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
  switchedAt: string;
}

/**
 * Verifies a 4-6 digit shift-switch PIN on a shared counter/POS device,
 * switching active staff context without requiring OS re-login.
 */
export async function verifyTerminalPin(
  params: VerifyTerminalPinParams
): Promise<SwitchedTerminalUser> {
  const { pin, organizationId, terminalKey = "default", branchId, prisma } = params;

  if (!/^\d{4,6}$/.test(pin)) {
    throw new ValidationError("Terminal PIN must be 4 to 6 numeric digits", [
      { name: "terminalPin", reason: "PIN must be 4 to 6 numeric digits" },
    ]);
  }

  const rateLimitKey = `${organizationId}:${terminalKey}`;
  checkAndRecordRateLimit(rateLimitKey);

  // Fetch all active members in this organization who have configured a terminal PIN
  const members = await prisma.userOrganization.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      terminalPinHash: { not: null },
    },
    include: {
      user: {
        include: {
          branchRoles: {
            where: {
              organizationId,
              ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
            },
            include: {
              role: {
                include: {
                  permissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Verify PIN against candidate member hashes
  for (const member of members) {
    if (member.terminalPinHash && (await verifyPin(pin, member.terminalPinHash))) {
      // Successful authentication: clear rate limit
      clearTerminalRateLimit(rateLimitKey);

      const roles = new Set<string>();
      const permissions = new Set<string>();

      for (const assignment of member.user.branchRoles) {
        roles.add(assignment.role.slug);
        if (assignment.role.isSystem) {
          permissions.add("*");
        }
        for (const rp of assignment.role.permissions) {
          permissions.add(rp.permission.action);
        }
      }

      return {
        switchedUserId: member.user.id,
        name: member.user.name,
        email: member.user.email,
        roles: Array.from(roles),
        permissions: Array.from(permissions),
        switchedAt: new Date().toISOString(),
      };
    }
  }

  // No match found: record failure and throw
  recordFailedAttempt(rateLimitKey);
  throw new UnauthorizedError("Incorrect terminal PIN entered", {
    code: "PIN_INVALID",
  });
}

export interface SetTerminalPinParams {
  userId: string;
  organizationId: string;
  newPin: string;
  prisma: PrismaClient;
}

/**
 * Sets or updates the 4-6 digit fast shift-switch PIN for a user in an organization.
 */
export async function setTerminalPin(
  params: SetTerminalPinParams
): Promise<{ updatedAt: string; message: string }> {
  const { userId, organizationId, newPin, prisma } = params;

  if (!/^\d{4,6}$/.test(newPin)) {
    throw new ValidationError("Terminal PIN must be 4 to 6 numeric digits", [
      { name: "newPin", reason: "PIN must be 4 to 6 numeric digits" },
    ]);
  }

  const hashedPin = await hashPin(newPin);

  await prisma.userOrganization.update({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
    data: {
      terminalPinHash: hashedPin,
      updatedAt: new Date(),
    },
  });

  return {
    updatedAt: new Date().toISOString(),
    message: "Terminal shift PIN updated successfully",
  };
}
