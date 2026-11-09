import { getEmailQueue } from "@suite/redis";
import { getPlatformPrismaClient } from "../../lib/platform-db.js";
import { readPlatformRuntimeConfig } from "../../lib/platform-env.js";
import { readPlatformHealth } from "./health.service.js";
import { readQueueMetrics } from "./queue-metrics.service.js";

/**
 * Composition for the operator telemetry reads. The route receives a mapped
 * view; the platform database, cache and queue clients stay in services (P2).
 */
export async function readPlatformHealthView() {
  return readPlatformHealth({
    platformPrisma: getPlatformPrismaClient(),
    emailQueue: getEmailQueue(),
    config: readPlatformRuntimeConfig(),
  });
}

export async function readPlatformQueueView() {
  return readQueueMetrics({
    prisma: getPlatformPrismaClient(),
    now: new Date(),
    emailQueue: getEmailQueue(),
  });
}
