import type { PrismaClient } from "@suite/db";
import { createPlatformPrismaClient } from "@suite/db";
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
