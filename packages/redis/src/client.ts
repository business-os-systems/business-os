import { Redis, type RedisOptions } from "ioredis";

export interface RedisHealthResult {
  status: "healthy" | "unhealthy";
  latencyMs: number;
  error?: string;
}

const DEFAULT_REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

/**
 * Creates a configured ioredis instance with exponential backoff and connection retry strategy.
 */
export function createRedisClient(urlOrOptions: string | RedisOptions = DEFAULT_REDIS_URL): Redis {
  const defaultOptions: RedisOptions = {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: true,
    connectTimeout: 10000,
    retryStrategy(times: number) {
      // Exponential backoff with jitter, capped at 3000ms
      const delay = Math.min(times * 100 + Math.floor(Math.random() * 50), 3000);
      return delay;
    },
    reconnectOnError(err: Error) {
      const targetErrors = ["READONLY", "ETIMEDOUT", "ECONNRESET"];
      return targetErrors.some((target) => err.message.includes(target));
    },
  };

  if (typeof urlOrOptions === "string") {
    return new Redis(urlOrOptions, defaultOptions);
  }

  return new Redis({
    ...defaultOptions,
    ...urlOrOptions,
  });
}

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

/**
 * Singleton Redis connection for general application caching and mutexes.
 */
export const redis: Redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

/**
 * Performs a health check ping against the specified Redis connection.
 */
export async function redisHealthCheck(client: Redis = redis): Promise<RedisHealthResult> {
  const start = performance.now();
  try {
    const pong = await client.ping();
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;
    if (pong === "PONG") {
      return { status: "healthy", latencyMs };
    }
    return {
      status: "unhealthy",
      latencyMs,
      error: `Unexpected ping response: ${pong}`,
    };
  } catch (err) {
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;
    return {
      status: "unhealthy",
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Gracefully closes the Redis connection.
 */
export async function closeRedis(client: Redis = redis): Promise<void> {
  if (client.status !== "end") {
    await client.quit();
  }
}
