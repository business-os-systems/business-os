import { createHash } from "node:crypto";
import type { PrismaClient } from "@suite/db";
import { UnauthorizedError, ValidationError, RateLimitError } from "@suite/core/errors";
import { redis } from "@suite/redis";
import { hashPin, verifyPin } from "./pin-engine.js";

/**
 * Terminal Rate Limiter configuration:
 * - Max 5 attempts
 * - 15 minutes lockout window (900 seconds)
 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_SECONDS = 15 * 60; // 900 seconds

export async function clearTerminalRateLimit(key: string): Promise<void> {
  try {
    await redis.del(`rl:terminal:attempts:${key}`, `rl:terminal:locked:${key}`);
  } catch {
    // Graceful no-op if redis is disconnected
  }
}

export async function clearAllTerminalRateLimits(): Promise<void> {
  try {
    const keys = await redis.keys("rl:terminal:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Graceful no-op if redis is disconnected
  }
}

async function checkAndRecordRateLimit(key: string): Promise<void> {
  try {
    const lockedTtl = await redis.ttl(`rl:terminal:locked:${key}`);
    if (lockedTtl > 0) {
      throw new RateLimitError(
        `Terminal PIN switch locked due to excessive failed attempts. Try again in ${lockedTtl} seconds.`,
        lockedTtl,
        {
          code: "AUTH_PIN_LOCKED",
        }
      );
    }
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
  }
}

async function recordFailedAttempt(key: string): Promise<void> {
  try {
    const attemptsKey = `rl:terminal:attempts:${key}`;
    const lockedKey = `rl:terminal:locked:${key}`;

    const pipeline = redis.pipeline();
    pipeline.incr(attemptsKey);
    pipeline.ttl(attemptsKey);
    const results = await pipeline.exec();

    const count = typeof results?.[0]?.[1] === "number" ? results[0][1] : 1;
    const ttl = typeof results?.[1]?.[1] === "number" ? results[1][1] : -1;

    if (ttl === -1) {
      await redis.expire(attemptsKey, LOCKOUT_WINDOW_SECONDS);
    }

    if (count >= MAX_FAILED_ATTEMPTS) {
      await redis.set(lockedKey, "1", "EX", LOCKOUT_WINDOW_SECONDS);
      await redis.del(attemptsKey);
      throw new RateLimitError(
        "Terminal PIN switch locked after 5 failed attempts. Please wait 15 minutes or contact an administrator.",
        LOCKOUT_WINDOW_SECONDS,
        {
          code: "AUTH_PIN_LOCKED",
        }
      );
    }
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
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

interface MemberWithRoles {
  userId: string;
  terminalPinHash?: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    branchRoles: Array<{
      role: {
        slug: string;
        isSystem: boolean;
        permissions: Array<{
          permission: {
            action: string;
          };
        }>;
      };
    }>;
  };
}

function extractSwitchedUser(member: MemberWithRoles): SwitchedTerminalUser {
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
  await checkAndRecordRateLimit(rateLimitKey);

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

  // Issue 30: Check fast key-derivation cache in Redis to prevent Argon2 CPU starvation during rapid punches
  const pinFingerprint = createHash("sha256").update(`${organizationId}:${pin}`).digest("hex");
  const cacheKey = `cache:terminal:pin:${organizationId}:${pinFingerprint}`;
  let cachedUserId: string | null = null;
  try {
    cachedUserId = await redis.get(cacheKey);
  } catch {
    // Redis unavailable, proceed to compute
  }

  if (cachedUserId) {
    const cachedMember = members.find((m) => m.userId === cachedUserId || m.user.id === cachedUserId);
    if (cachedMember) {
      await clearTerminalRateLimit(rateLimitKey);
      return extractSwitchedUser(cachedMember);
    }
  }

  // Verify PIN against candidate member hashes
  for (const member of members) {
    if (member.terminalPinHash && (await verifyPin(pin, member.terminalPinHash))) {
      // Successful authentication: clear rate limit and cache key-derivation for 5 minutes
      await clearTerminalRateLimit(rateLimitKey);
      try {
        await redis.set(cacheKey, member.user.id, "EX", 300);
      } catch {
        // Non-blocking
      }

      return extractSwitchedUser(member);
    }
  }

  // No match found: record failure and throw
  await recordFailedAttempt(rateLimitKey);
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

  try {
    const keys = await redis.keys(`cache:terminal:pin:${organizationId}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Non-blocking
  }

  return {
    updatedAt: new Date().toISOString(),
    message: "Terminal shift PIN updated successfully",
  };
}
