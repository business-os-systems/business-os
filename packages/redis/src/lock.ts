import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { redis as defaultRedis } from "./client.js";

export class LockAcquisitionError extends Error {
  public readonly key: string;
  public readonly ttlMs: number;

  constructor(key: string, ttlMs: number, message?: string) {
    super(message ?? `Failed to acquire distributed lock for key "${key}" within allocated attempts`);
    this.name = "LockAcquisitionError";
    this.key = key;
    this.ttlMs = ttlMs;
  }
}

export interface LockOptions {
  client?: Redis;
  retries?: number;
  retryDelayMs?: number;
  lockKeyPrefix?: string;
}

const RELEASE_LOCK_LUA_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Attempts to acquire an atomic distributed lock in Redis.
 * Returns true if the lock was acquired, false otherwise.
 */
export async function acquireLock(
  key: string,
  token: string,
  ttlMs: number,
  client: Redis = defaultRedis,
  prefix = "lock:"
): Promise<boolean> {
  const fullKey = `${prefix}${key}`;
  const result = await client.set(fullKey, token, "PX", ttlMs, "NX");
  return result === "OK";
}

/**
 * Safely releases an atomic distributed lock via Lua script,
 * verifying that the caller still owns the lock token before deleting.
 */
export async function releaseLock(
  key: string,
  token: string,
  client: Redis = defaultRedis,
  prefix = "lock:"
): Promise<boolean> {
  const fullKey = `${prefix}${key}`;
  const result = await client.eval(RELEASE_LOCK_LUA_SCRIPT, 1, fullKey, token);
  return result === 1;
}

/**
 * Executes an operation guarded by a distributed mutex lock.
 * If the lock is already held, throws LockAcquisitionError (or retries if configured).
 * The lock is released atomically upon completion or failure.
 */
export async function withDistributedLock<T>(
  key: string,
  ttlMs: number,
  operation: () => Promise<T>,
  options: LockOptions = {}
): Promise<T> {
  const {
    client = defaultRedis,
    retries = 0,
    retryDelayMs = 50,
    lockKeyPrefix = "lock:",
  } = options;

  const token = randomUUID();
  let acquired = false;
  let attempts = 0;

  while (attempts <= retries) {
    acquired = await acquireLock(key, token, ttlMs, client, lockKeyPrefix);
    if (acquired) {
      break;
    }
    attempts += 1;
    if (attempts <= retries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  if (!acquired) {
    throw new LockAcquisitionError(key, ttlMs);
  }

  try {
    return await operation();
  } finally {
    try {
      await releaseLock(key, token, client, lockKeyPrefix);
    } catch {
      // In case Redis connection dropped during release, the TTL safeguards cleanup.
    }
  }
}
