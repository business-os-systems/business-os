import type { Redis } from "ioredis";
import { redis as defaultRedis } from "./client.js";

export interface CacheManager {
  get<T>(tenantId: string, key: string): Promise<T | null>;
  set(tenantId: string, key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  del(tenantId: string, key: string): Promise<void>;
  invalidatePattern(tenantId: string, pattern: string): Promise<void>;
  formatKey(tenantId: string, key: string): string;
}

/**
 * Formats a key with strict tenant isolation prefix: tenant:{tenantId}:{key}
 */
export function formatTenantKey(tenantId: string, key: string): string {
  if (!tenantId || tenantId.trim() === "") {
    throw new Error("Tenant ID must not be empty for cache operations");
  }
  return `tenant:${tenantId}:${key}`;
}

/**
 * Creates a tenant-namespaced Cache Manager on top of Redis.
 */
export function createCacheManager(client: Redis = defaultRedis): CacheManager {
  return {
    formatKey(tenantId: string, key: string): string {
      return formatTenantKey(tenantId, key);
    },

    async get<T>(tenantId: string, key: string): Promise<T | null> {
      const fullKey = formatTenantKey(tenantId, key);
      const raw = await client.get(fullKey);
      if (raw === null) {
        return null;
      }
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as unknown as T;
      }
    },

    async set(
      tenantId: string,
      key: string,
      value: unknown,
      ttlSeconds?: number
    ): Promise<void> {
      const fullKey = formatTenantKey(tenantId, key);
      const serialized = typeof value === "string" ? value : JSON.stringify(value);

      if (ttlSeconds && ttlSeconds > 0) {
        await client.set(fullKey, serialized, "EX", ttlSeconds);
      } else {
        await client.set(fullKey, serialized);
      }
    },

    async del(tenantId: string, key: string): Promise<void> {
      const fullKey = formatTenantKey(tenantId, key);
      await client.del(fullKey);
    },

    async invalidatePattern(tenantId: string, pattern: string): Promise<void> {
      const fullPattern = formatTenantKey(tenantId, pattern);
      let cursor = "0";

      do {
        // Use non-blocking SCAN with count 100
        const [nextCursor, keys] = await client.scan(
          cursor,
          "MATCH",
          fullPattern,
          "COUNT",
          100
        );
        cursor = nextCursor;

        if (keys.length > 0) {
          const pipeline = client.pipeline();
          for (const k of keys) {
            pipeline.del(k);
          }
          await pipeline.exec();
        }
      } while (cursor !== "0");
    },
  };
}

/**
 * Singleton Cache Manager using the master Redis client.
 */
export const cacheManager: CacheManager = createCacheManager();
