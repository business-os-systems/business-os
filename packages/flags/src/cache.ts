import type { Redis } from "ioredis";
import type { FeatureFlagDefinition } from "./types.js";

export const CACHE_TTL = {
  FLAG_DEFINITION_SECONDS: 300, // 5-minute safety window
  EVALUATION_SECONDS: 60, // 1-minute fast path window
} as const;

export function buildFlagDefinitionCacheKey(environment: string, flagKey: string): string {
  return `suite:${environment}:flags:${flagKey}`;
}

export function buildEvaluationCacheKey(
  environment: string,
  flagKey: string,
  organizationId?: string
): string {
  return `suite:${environment}:flags:eval:${flagKey}:${organizationId ?? "global"}`;
}

export function buildEvaluationPatternKey(environment: string, flagKey: string): string {
  return `suite:${environment}:flags:eval:${flagKey}:*`;
}

/**
 * Reads cached flag definition from Redis.
 * Degrades gracefully by returning null if Redis is unavailable.
 */
export async function getCachedFlag(
  redis: Redis,
  environment: string,
  flagKey: string
): Promise<FeatureFlagDefinition | null> {
  try {
    const key = buildFlagDefinitionCacheKey(environment, flagKey);
    const raw = await redis.get(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as FeatureFlagDefinition;
  } catch {
    return null;
  }
}

/**
 * Stores flag definition in Redis with 300-second safety TTL.
 */
export async function setCachedFlag(
  redis: Redis,
  environment: string,
  flagKey: string,
  flag: FeatureFlagDefinition,
  ttlSeconds: number = CACHE_TTL.FLAG_DEFINITION_SECONDS
): Promise<void> {
  try {
    const key = buildFlagDefinitionCacheKey(environment, flagKey);
    await redis.set(key, JSON.stringify(flag), "EX", ttlSeconds);
  } catch {
    // Fail-open for caching writes
  }
}

/**
 * Reads cached evaluation boolean result from Redis fast path.
 */
export async function getCachedEvaluation(
  redis: Redis,
  environment: string,
  flagKey: string,
  organizationId?: string
): Promise<boolean | null> {
  try {
    const key = buildEvaluationCacheKey(environment, flagKey, organizationId);
    const raw = await redis.get(key);
    if (raw === null) {
      return null;
    }
    return raw === "1" || raw === "true";
  } catch {
    return null;
  }
}

/**
 * Stores evaluation boolean result in Redis with 60-second TTL.
 */
export async function setCachedEvaluation(
  redis: Redis,
  environment: string,
  flagKey: string,
  result: boolean,
  organizationId?: string,
  ttlSeconds: number = CACHE_TTL.EVALUATION_SECONDS
): Promise<void> {
  try {
    const key = buildEvaluationCacheKey(environment, flagKey, organizationId);
    await redis.set(key, result ? "1" : "0", "EX", ttlSeconds);
  } catch {
    // Fail-open for caching writes
  }
}

/**
 * Synchronously invalidates all Redis cache keys for a given flag and environment.
 */
export async function invalidateFlagCache(
  redis: Redis,
  environment: string,
  flagKey: string
): Promise<void> {
  try {
    const defKey = buildFlagDefinitionCacheKey(environment, flagKey);
    const pattern = buildEvaluationPatternKey(environment, flagKey);

    const keysToDelete = [defKey];
    const evalKeys = await redis.keys(pattern);
    if (evalKeys.length > 0) {
      keysToDelete.push(...evalKeys);
    }

    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
    }
  } catch {
    // Suppress cache invalidation failure on Redis downtime
  }
}
