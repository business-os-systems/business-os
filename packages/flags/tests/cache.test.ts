import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Redis } from "ioredis";
import type { PrismaClient } from "@suite/db";
import {
  buildEvaluationCacheKey,
  buildEvaluationPatternKey,
  buildFlagDefinitionCacheKey,
  CACHE_TTL,
  getCachedEvaluation,
  getCachedFlag,
  invalidateFlagCache,
  setCachedEvaluation,
  setCachedFlag,
} from "../src/cache.js";
import { FeatureFlagClient } from "../src/client.js";
import type { FeatureFlagDefinition } from "../src/types.js";
import { RULE_TYPES } from "../src/types.js";

describe("Redis Read-Through Caching & Eviction (@suite/flags)", () => {
  let mockRedis: Partial<Redis>;
  let inMemoryStore: Map<string, string>;

  beforeEach(() => {
    inMemoryStore = new Map();
    mockRedis = {
      get: vi.fn(async (key: string) => inMemoryStore.get(key) ?? null) as unknown as Redis["get"],
      set: vi.fn(async (key: string, value: string) => {
        inMemoryStore.set(key, value);
        return "OK";
      }) as unknown as Redis["set"],
      del: vi.fn(async (...keys: string[]) => {
        let count = 0;
        for (const k of keys) {
          if (inMemoryStore.delete(k)) count++;
        }
        return count;
      }) as unknown as Redis["del"],
      keys: vi.fn(async (pattern: string) => {
        const prefix = pattern.replace("*", "");
        return Array.from(inMemoryStore.keys()).filter((k) => k.startsWith(prefix));
      }) as unknown as Redis["keys"],
    };
  });

  describe("Cache Key Construction", () => {
    it("builds the authoritative flag definition key", () => {
      const key = buildFlagDefinitionCacheKey("production", "new_checkout");
      expect(key).toBe("suite:production:flags:new_checkout");
    });

    it("builds the evaluation fast path key with tenant context", () => {
      const key = buildEvaluationCacheKey("staging", "dark_mode", "org_123");
      expect(key).toBe("suite:staging:flags:eval:dark_mode:org_123");
    });

    it("builds the evaluation fast path key with global fallback when tenant is omitted", () => {
      const key = buildEvaluationCacheKey("development", "beta_feature");
      expect(key).toBe("suite:development:flags:eval:beta_feature:global");
    });

    it("builds the wildcard pattern for batch tenant cache eviction", () => {
      const pattern = buildEvaluationPatternKey("production", "custom_domains");
      expect(pattern).toBe("suite:production:flags:eval:custom_domains:*");
    });
  });

  describe("Cache Read/Write Operations", () => {
    const sampleFlag: FeatureFlagDefinition = {
      key: "live_chat",
      name: "Live Chat Widget",
      environment: "production",
      isEnabled: true,
      defaultEnabled: false,
      version: 2,
      rules: [
        {
          id: "rule_1",
          ruleType: RULE_TYPES.ORGANIZATION,
          targetId: "org_vip",
          enabled: true,
          priority: 1,
        },
      ],
    };

    it("stores and retrieves a flag definition in Redis with 300s TTL", async () => {
      await setCachedFlag(mockRedis as Redis, "production", "live_chat", sampleFlag);

      expect(mockRedis.set).toHaveBeenCalledWith(
        "suite:production:flags:live_chat",
        JSON.stringify(sampleFlag),
        "EX",
        CACHE_TTL.FLAG_DEFINITION_SECONDS
      );

      const retrieved = await getCachedFlag(mockRedis as Redis, "production", "live_chat");
      expect(retrieved).toEqual(sampleFlag);
    });

    it("stores and retrieves evaluation boolean results with 60s TTL", async () => {
      await setCachedEvaluation(
        mockRedis as Redis,
        "production",
        "live_chat",
        true,
        "org_vip"
      );

      expect(mockRedis.set).toHaveBeenCalledWith(
        "suite:production:flags:eval:live_chat:org_vip",
        "1",
        "EX",
        CACHE_TTL.EVALUATION_SECONDS
      );

      const evalResult = await getCachedEvaluation(
        mockRedis as Redis,
        "production",
        "live_chat",
        "org_vip"
      );
      expect(evalResult).toBe(true);
    });

    it("returns null when cache misses", async () => {
      const result = await getCachedFlag(mockRedis as Redis, "production", "non_existent");
      expect(result).toBeNull();

      const evalResult = await getCachedEvaluation(mockRedis as Redis, "production", "non_existent");
      expect(evalResult).toBeNull();
    });
  });

  describe("Synchronous Cache Invalidation", () => {
    it("invalidates both flag definition and all tenant evaluation keys", async () => {
      const flag: FeatureFlagDefinition = {
        key: "ai_copilot",
        name: "AI Copilot",
        environment: "production",
        isEnabled: true,
        defaultEnabled: true,
        version: 1,
      };

      await setCachedFlag(mockRedis as Redis, "production", "ai_copilot", flag);
      await setCachedEvaluation(mockRedis as Redis, "production", "ai_copilot", true, "org_1");
      await setCachedEvaluation(mockRedis as Redis, "production", "ai_copilot", false, "org_2");

      expect(inMemoryStore.size).toBe(3);

      await invalidateFlagCache(mockRedis as Redis, "production", "ai_copilot");

      expect(inMemoryStore.get("suite:production:flags:ai_copilot")).toBeUndefined();
      expect(inMemoryStore.get("suite:production:flags:eval:ai_copilot:org_1")).toBeUndefined();
      expect(inMemoryStore.get("suite:production:flags:eval:ai_copilot:org_2")).toBeUndefined();
      expect(inMemoryStore.size).toBe(0);
    });
  });

  describe("Redis Downtime & PostgreSQL Fallback (FeatureFlagClient)", () => {
    it("transparently degrades to PostgreSQL when Redis is down or throwing errors", async () => {
      const failingRedis = {
        get: vi.fn().mockRejectedValue(new Error("ECONNREFUSED: Redis connection lost")),
        set: vi.fn().mockRejectedValue(new Error("ECONNREFUSED: Redis connection lost")),
        del: vi.fn().mockRejectedValue(new Error("ECONNREFUSED: Redis connection lost")),
        keys: vi.fn().mockRejectedValue(new Error("ECONNREFUSED: Redis connection lost")),
      } as unknown as Redis;

      const mockPrisma = {
        featureFlag: {
          findUnique: vi.fn().mockResolvedValue({
            id: "flag_db_1",
            key: "pos_cloud_sync",
            name: "POS Cloud Sync",
            description: null,
            environment: "production",
            isEnabled: true,
            defaultEnabled: false,
            version: 1,
            metadata: null,
            rules: [
              {
                id: "rule_org_100",
                ruleType: "ORGANIZATION",
                targetId: "org_pos_100",
                enabled: true,
                priority: 0,
              },
            ],
          }),
        },
      } as unknown as PrismaClient;

      const client = new FeatureFlagClient({
        redis: failingRedis,
        prisma: mockPrisma,
        defaultEnvironment: "production",
      });

      // Evaluation should succeed via DB fallback despite Redis failure
      const isEnabled = await client.isEnabled("pos_cloud_sync", {
        organizationId: "org_pos_100",
      });

      expect(isEnabled).toBe(true);
      expect(mockPrisma.featureFlag.findUnique).toHaveBeenCalled();
    });

    it("returns false (fail-closed) when both Redis and PostgreSQL fail", async () => {
      const failingRedis = {
        get: vi.fn().mockRejectedValue(new Error("Redis offline")),
      } as unknown as Redis;

      const failingPrisma = {
        featureFlag: {
          findUnique: vi.fn().mockRejectedValue(new Error("Postgres connection pool exhausted")),
        },
      } as unknown as PrismaClient;

      const client = new FeatureFlagClient({
        redis: failingRedis,
        prisma: failingPrisma,
        defaultEnvironment: "production",
      });

      const isEnabled = await client.isEnabled("critical_feature");
      expect(isEnabled).toBe(false);
    });

    it("returns false (fail-closed) when flag does not exist in database", async () => {
      const mockPrisma = {
        featureFlag: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      } as unknown as PrismaClient;

      const client = new FeatureFlagClient({
        redis: mockRedis as Redis,
        prisma: mockPrisma,
        defaultEnvironment: "development",
      });

      const isEnabled = await client.isEnabled("ghost_flag");
      expect(isEnabled).toBe(false);
    });
  });
});
