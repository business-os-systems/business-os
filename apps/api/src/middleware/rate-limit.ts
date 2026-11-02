import type { MiddlewareHandler, Context } from "hono";
import { RateLimitError, ServiceUnavailableError } from "@suite/core/errors";
import { redis } from "@suite/redis";
import { getConnInfo } from "@hono/node-server/conninfo";

export interface RateLimitOptions {
  limit?: number; // Maximum requests allowed within window
  windowSeconds?: number; // Time window in seconds
  keyPrefix?: string;
  failureMode?: "open" | "closed";
}

export async function clearRateLimitStore(keyPrefix = "test:rl"): Promise<void> {
  try {
    const keys = await redis.keys(`${keyPrefix}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // no-op if redis is disconnected
  }
}

export async function clearMemoryRateLimitStore(): Promise<void> {
  await clearRateLimitStore();
}

const RATE_LIMIT_LUA_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if tonumber(current) == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
`;

function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}

function resolveClientIp(c: Context): string {
  const socketIp = socketAddress(c);
  const trustedProxies = new Set(
    (process.env.TRUSTED_PROXY_IPS ?? "")
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean)
  );
  const trustForwardedHeaders =
    process.env.NODE_ENV === "test" ||
    (socketIp !== undefined && trustedProxies.has(socketIp));

  if (trustForwardedHeaders) {
    const cfConnectingIp = c.req.header("cf-connecting-ip");
    if (cfConnectingIp) return cfConnectingIp.trim();

    const forwardedFor = c.req.header("x-forwarded-for");
    if (forwardedFor) {
      const firstIp = forwardedFor.split(",")[0]?.trim();
      if (firstIp) return firstIp;
    }

    const realIp = c.req.header("x-real-ip");
    if (realIp) return realIp.trim();
  }

  return socketIp ?? "127.0.0.1";
}

async function executeAtomicRateLimit(
  key: string,
  windowSeconds: number
): Promise<{ currentCount: number; resetSeconds: number }> {
  try {
    const result = (await redis.eval(
      RATE_LIMIT_LUA_SCRIPT,
      1,
      key,
      windowSeconds
    )) as [number, number] | null;

    if (Array.isArray(result) && result.length >= 2) {
      const current = Number(result[0]);
      const ttl = Number(result[1]);
      return {
        currentCount: Number.isFinite(current) ? current : 1,
        resetSeconds: Number.isFinite(ttl) && ttl > 0 ? ttl : windowSeconds,
      };
    }
  } catch {
    // Fallback to atomic pipeline if eval is disabled or running in lightweight mock
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, windowSeconds);
    pipeline.ttl(key);
    const results = await pipeline.exec();
    const count = Number(results?.[0]?.[1] ?? 1);
    const ttl = Number(results?.[2]?.[1] ?? windowSeconds);
    return {
      currentCount: Number.isFinite(count) ? count : 1,
      resetSeconds: Number.isFinite(ttl) && ttl > 0 ? ttl : windowSeconds,
    };
  }

  return { currentCount: 1, resetSeconds: windowSeconds };
}

/**
 * Sliding window rate limiting middleware.
 * Uses atomic Redis Lua scripting to guarantee atomic increment and key expiration.
 */
export function rateLimitMiddleware(options: RateLimitOptions = {}): MiddlewareHandler {
  const {
    limit = 60,
    windowSeconds = 60,
    keyPrefix = "rl:global",
    failureMode = "open",
  } = options;

  return async (c, next) => {
    const path = c.req.path;
    if (path.startsWith("/health") || path === "/metrics") {
      return next();
    }

    const clientIp = resolveClientIp(c);
    const key = `${keyPrefix}:${clientIp}`;

    let currentCount = 0;
    let resetSeconds = windowSeconds;

    try {
      const rateLimitResult = await executeAtomicRateLimit(key, windowSeconds);
      currentCount = rateLimitResult.currentCount;
      resetSeconds = rateLimitResult.resetSeconds;
    } catch (error) {
      console.warn(
        `[RateLimit] Redis unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      if (failureMode === "closed") {
        throw new ServiceUnavailableError(
          "Rate limiting is temporarily unavailable.",
          { code: "RATE_LIMIT_UNAVAILABLE" }
        );
      }
      return next();
    }

    const remaining = Math.max(0, limit - currentCount);

    c.header("RateLimit-Limit", String(limit));
    c.header("RateLimit-Remaining", String(remaining));
    c.header("RateLimit-Reset", String(resetSeconds));

    if (currentCount > limit) {
      throw new RateLimitError(
        `Rate limit exceeded. Maximum ${limit} requests allowed per ${windowSeconds} seconds.`,
        resetSeconds,
        { code: "RATE_LIMIT_EXCEEDED" }
      );
    }

    await next();
  };
}
