import type { MiddlewareHandler } from "hono";
import { RateLimitError } from "@suite/core/errors";
import { redis } from "@suite/redis";

export interface RateLimitOptions {
  limit?: number; // Maximum requests allowed within window
  windowSeconds?: number; // Time window in seconds
  keyPrefix?: string;
}

// In-memory fallback if Redis is unavailable or in unit test mode
interface WindowCounter {
  count: number;
  resetTime: number;
}
const memoryRateLimitStore = new Map<string, WindowCounter>();

export function clearMemoryRateLimitStore(): void {
  memoryRateLimitStore.clear();
}

/**
 * Sliding window rate limiting middleware.
 * Uses @suite/redis for distributed multi-instance token tracking, with in-memory fallback.
 */
export function rateLimitMiddleware(options: RateLimitOptions = {}): MiddlewareHandler {
  const { limit = 60, windowSeconds = 60, keyPrefix = "rl:global" } = options;

  return async (c, next) => {
    // Exclude health and metrics endpoints from rate limiting
    const path = c.req.path;
    if (path.startsWith("/health") || path === "/metrics") {
      return next();
    }

    const clientIp =
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("x-real-ip") ||
      "127.0.0.1";

    const key = `${keyPrefix}:${clientIp}`;
    const now = Date.now();
    let currentCount = 0;
    let resetSeconds = windowSeconds;

    try {
      if (redis.status === "ready") {
        const pipeline = redis.pipeline();
        pipeline.incr(key);
        pipeline.ttl(key);
        const results = await pipeline.exec();

        const countResult = results?.[0]?.[1];
        const ttlResult = results?.[1]?.[1];

        currentCount = typeof countResult === "number" ? countResult : 1;
        const ttl = typeof ttlResult === "number" ? ttlResult : -1;

        if (ttl === -1) {
          await redis.expire(key, windowSeconds);
          resetSeconds = windowSeconds;
        } else {
          resetSeconds = ttl > 0 ? ttl : windowSeconds;
        }
      } else {
        throw new Error("Redis not ready, use in-memory fallback");
      }
    } catch {
      // In-memory fallback
      let record = memoryRateLimitStore.get(key);
      if (!record || record.resetTime <= now) {
        record = { count: 1, resetTime: now + windowSeconds * 1000 };
      } else {
        record.count += 1;
      }
      memoryRateLimitStore.set(key, record);
      currentCount = record.count;
      resetSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
    }

    const remaining = Math.max(0, limit - currentCount);

    c.header("RateLimit-Limit", String(limit));
    c.header("RateLimit-Remaining", String(remaining));
    c.header("RateLimit-Reset", String(resetSeconds));

    if (currentCount > limit) {
      throw new RateLimitError(
        `Rate limit exceeded. Maximum ${limit} requests allowed per ${windowSeconds} seconds.`,
        resetSeconds,
        {
          code: "RATE_LIMIT_EXCEEDED",
        }
      );
    }

    await next();
  };
}
