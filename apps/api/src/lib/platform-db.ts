import type { PrismaClient } from "@suite/db";
import { createPlatformPrismaClient } from "@suite/db";
import { redis, type Redis } from "@suite/redis";
import { getPlatformDatabaseUrl } from "./platform-env.js";

let client: PrismaClient | null = null;

/**
 * The Platform API always uses the app_platform identity. The client is lazy so
 * importing the app does not require a database connection at module load.
 */
export function getPlatformPrismaClient(): PrismaClient {
  if (client === null) {
    client = createPlatformPrismaClient({
      databaseUrl: getPlatformDatabaseUrl(),
    });
  }
  return client;
}

/** Route-safe access to the shared cache client; routes import this, not Redis. */
export function getPlatformRedis(): Redis {
  return redis;
}
