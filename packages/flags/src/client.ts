import type { PrismaClient } from "@suite/db";
import { prisma as defaultPrisma } from "@suite/db";
import type { Redis } from "ioredis";
import { redis as defaultRedis } from "@suite/redis";
import type {
  FeatureFlagDefinition,
  FlagEvaluationContext,
  IFeatureFlagClient,
  RuleType,
} from "./types.js";
import { evaluateFeatureFlag } from "./evaluation.js";
import {
  getCachedEvaluation,
  getCachedFlag,
  invalidateFlagCache,
  setCachedEvaluation,
  setCachedFlag,
} from "./cache.js";

export interface FeatureFlagClientOptions {
  prisma?: PrismaClient;
  redis?: Redis;
  defaultEnvironment?: string;
}

export class FeatureFlagClient implements IFeatureFlagClient {
  private readonly prisma: PrismaClient;
  private readonly redis: Redis;
  private readonly defaultEnvironment: string;

  constructor(options: FeatureFlagClientOptions = {}) {
    this.prisma = options.prisma ?? defaultPrisma;
    this.redis = options.redis ?? defaultRedis;
    this.defaultEnvironment =
      options.defaultEnvironment ?? process.env.NODE_ENV ?? "development";
  }

  /**
   * Evaluates whether a feature flag is enabled for the provided context.
   * Resolves in <5ms via Redis cache, falling back to PostgreSQL.
   * Returns false (fail-closed) if flag does not exist or an error occurs.
   */
  async isEnabled(flagKey: string, context: FlagEvaluationContext = {}): Promise<boolean> {
    try {
      const environment = context.environment ?? this.defaultEnvironment;

      // 1. Fast Path: Check evaluation cache
      const cachedResult = await getCachedEvaluation(
        this.redis,
        environment,
        flagKey,
        context.organizationId
      );

      if (cachedResult !== null) {
        return cachedResult;
      }

      // 2. Fetch full flag definition (from Redis definition cache or PostgreSQL)
      const flag = await this.getFlag(flagKey, environment);
      if (!flag) {
        return false;
      }

      // 3. Deterministic 4-tier evaluation
      const evaluated = evaluateFeatureFlag(flag, { ...context, environment });

      // 4. Populate evaluation cache (background / best-effort)
      await setCachedEvaluation(
        this.redis,
        environment,
        flagKey,
        evaluated,
        context.organizationId
      );

      return evaluated;
    } catch {
      // Strict fail-closed policy
      return false;
    }
  }

  /**
   * Retrieves full flag definition including active rules and metadata.
   * Checks Redis first, falling back to PostgreSQL if cache misses or Redis is down.
   */
  async getFlag(flagKey: string, environment?: string): Promise<FeatureFlagDefinition | null> {
    const targetEnv = environment ?? this.defaultEnvironment;

    try {
      // 1. Try Redis cache
      const cached = await getCachedFlag(this.redis, targetEnv, flagKey);
      if (cached) {
        return cached;
      }
    } catch {
      // Fallback cleanly to DB
    }

    try {
      // 2. Query PostgreSQL
      const record = await this.prisma.featureFlag.findUnique({
        where: {
          environment_key: {
            environment: targetEnv,
            key: flagKey,
          },
        },
        include: {
          rules: true,
        },
      });

      if (!record) {
        return null;
      }

      const definition: FeatureFlagDefinition = {
        key: record.key,
        name: record.name,
        description: record.description,
        environment: record.environment,
        isEnabled: record.isEnabled,
        defaultEnabled: record.defaultEnabled,
        version: record.version,
        metadata: (record.metadata as Record<string, unknown>) ?? null,
        expiresAt: record.expiresAt?.toISOString() ?? null,
        rules: record.rules.map((r) => ({
          id: r.id,
          ruleType: r.ruleType as RuleType,
          targetId: r.targetId,
          enabled: r.enabled,
          priority: r.priority,
        })),
      };

      // 3. Cache flag definition in Redis (best-effort)
      await setCachedFlag(this.redis, targetEnv, flagKey, definition);

      return definition;
    } catch {
      return null;
    }
  }

  /**
   * Invalidates Redis cache for a specific flag across environments.
   */
  async invalidateCache(flagKey: string, environment?: string): Promise<void> {
    const targetEnv = environment ?? this.defaultEnvironment;
    await invalidateFlagCache(this.redis, targetEnv, flagKey);
  }
}

/**
 * Singleton FeatureFlagClient instance.
 */
export const featureFlags = new FeatureFlagClient();
