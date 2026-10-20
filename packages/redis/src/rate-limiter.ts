import { redis } from "./client.js";

export interface RateLimitRule {
  /** Unique cache key segment identifying the client or domain entity */
  key: string;
  /** Maximum allowed requests within the time window */
  max: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  /** Whether the request is within allowable thresholds */
  allowed: boolean;
  /** Seconds remaining until the rate limit window resets */
  retryAfter: number;
  /** Human-readable explanation when limit is breached */
  detail?: string;
  /** The specific rule key that triggered the block, if any */
  violatedRuleKey?: string;
}

/**
 * Universal multi-tier rate limiter with graceful Redis fallback.
 * Evaluates rules sequentially; blocks on the first violation.
 */
export async function checkRateLimit(
  rules: RateLimitRule[]
): Promise<RateLimitResult> {
  try {
    for (const rule of rules) {
      if (!rule.key || rule.max <= 0) continue;

      const currentCount = await redis.incr(rule.key);
      if (currentCount === 1) {
        await redis.expire(rule.key, rule.windowSeconds);
      }

      if (currentCount > rule.max) {
        const ttl = await redis.ttl(rule.key);
        const retryAfter = ttl > 0 ? ttl : rule.windowSeconds;
        return {
          allowed: false,
          retryAfter,
          detail: `Rate limit exceeded. Maximum ${rule.max} requests allowed per ${Math.round(rule.windowSeconds / 60)} minutes.`,
          violatedRuleKey: rule.key,
        };
      }
    }
  } catch (error) {
    // Fail-open safety: never block legitimate traffic if Redis experiences temporary outages
    console.warn("[RateLimiter] Redis rate limiting unavailable, proceeding with fallback safety:", error);
  }

  return { allowed: true, retryAfter: 0 };
}
