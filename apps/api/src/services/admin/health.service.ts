import { performance } from "node:perf_hooks";
import { prisma, type PrismaClient } from "@suite/db";
import { logger, scrubStringValues } from "@suite/logger";
import { redisHealthCheck } from "@suite/redis";
import {
  getAppVersion,
  getBuildTimestamp,
  getGitCommitSha,
  getNodeEnv,
} from "../../lib/env.js";
import type { PlatformRuntimeConfig } from "../../lib/platform-env.js";
import { readPlatformRuntimeConfig } from "../../lib/platform-env.js";
import { withTimeout } from "../../lib/with-timeout.js";
import {
  readQueueMetrics,
  summarizeQueueHealth,
  type EmailQueueClient,
  type QueueMetric,
} from "./queue-metrics.service.js";

/**
 * Platform health aggregation (FR-031 to FR-034).
 *
 * Probes live here rather than in the router so the readiness probe and the
 * operator health view share one bounded definition of "connected".
 */

export const DEFAULT_PROBE_TIMEOUT_MS = 150;
const API_SERVICE_NAME = "api";
const PLATFORM_DASHBOARD_SERVICE_NAME = "platform-dashboard";

/**
 * A service whose own version is not configured reports this instead of
 * inheriting another service's version (FR-034: never fabricate an identity).
 */
export const UNKNOWN_SERVICE_VERSION = "unknown";

export const HEALTH_STATES = ["healthy", "degraded", "unavailable"] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

export const DEPENDENCY_CRITICALITIES = ["critical", "supporting"] as const;
export type DependencyCriticality = (typeof DEPENDENCY_CRITICALITIES)[number];

export interface ProbeResult {
  readonly status: "connected" | "disconnected";
  readonly latencyMs: number;
  readonly error?: string;
}

export interface DependencyHealth {
  readonly name: string;
  readonly state: HealthState;
  readonly criticality: DependencyCriticality;
  readonly latencyMs: number | null;
  readonly lastCheckedAt: string;
  readonly detail: string;
}

export interface ServiceBuildIdentity {
  readonly name: string;
  readonly version: string;
  readonly buildId: string;
  readonly buildTimestamp: string;
  readonly environment: string;
}

export interface PlatformHealthSnapshot {
  readonly overall: HealthState;
  readonly dependencies: DependencyHealth[];
  readonly services: ServiceBuildIdentity[];
  readonly version: string;
  readonly buildTimestamp: string;
  readonly environment: string;
  readonly errorTrackingUrl: string | null;
  readonly checkedAt: string;
}

export async function measureEventLoopLag(): Promise<number> {
  const start = performance.now();
  await new Promise((resolve) => setImmediate(resolve));
  return Math.round((performance.now() - start) * 100) / 100;
}

function disconnectDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function probeDatabase(
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS
): Promise<ProbeResult> {
  const start = performance.now();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, timeoutMs, "Database");
    return {
      status: "connected",
      latencyMs: Math.round((performance.now() - start) * 100) / 100,
    };
  } catch (error) {
    return {
      status: "disconnected",
      latencyMs: Math.round((performance.now() - start) * 100) / 100,
      error: disconnectDetail(error),
    };
  }
}

export async function probeRedis(
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS
): Promise<ProbeResult> {
  const start = performance.now();
  try {
    const result = await withTimeout(redisHealthCheck(), timeoutMs, "Redis");
    if (result.status === "healthy") {
      return { status: "connected", latencyMs: result.latencyMs };
    }
    return {
      status: "disconnected",
      latencyMs: Math.round((performance.now() - start) * 100) / 100,
      error: result.error,
    };
  } catch (error) {
    return {
      status: "disconnected",
      latencyMs: Math.round((performance.now() - start) * 100) / 100,
      error: disconnectDetail(error),
    };
  }
}

interface ProbeDependencyInput {
  readonly name: string;
  readonly probe: ProbeResult;
  readonly description: string;
  readonly checkedAt: Date;
  readonly criticality: DependencyCriticality;
}

function probeDependency(input: ProbeDependencyInput): DependencyHealth {
  const { name, probe, description, checkedAt, criticality } = input;
  if (probe.status === "connected") {
    return {
      name,
      state: "healthy",
      criticality,
      latencyMs: probe.latencyMs,
      lastCheckedAt: checkedAt.toISOString(),
      detail: description,
    };
  }
  if (probe.error !== undefined) {
    logger.warn(
      { dependency: name, error: scrubStringValues(probe.error) },
      "Health dependency unreachable"
    );
  }
  return {
    name,
    state: "unavailable",
    criticality,
    latencyMs: probe.latencyMs,
    lastCheckedAt: checkedAt.toISOString(),
    detail: description + " is unreachable",
  };
}

function queueDependency(
  queues: readonly QueueMetric[],
  checkedAt: Date
): DependencyHealth {
  const summary = summarizeQueueHealth(queues);
  return {
    name: "background-processing",
    state: summary.state,
    criticality: "supporting",
    latencyMs: null,
    lastCheckedAt: checkedAt.toISOString(),
    detail: summary.detail,
  };
}

/**
 * The datastore decides whether the platform is unavailable. A failed cache
 * or queue degrades the platform but leaves tenant data reachable (US3 AC2).
 */
export function worstHealthState(
  dependencies: readonly DependencyHealth[]
): HealthState {
  const criticalUnavailable = dependencies.some(
    (dependency) =>
      dependency.criticality === "critical" &&
      dependency.state === "unavailable"
  );
  if (criticalUnavailable) {
    return "unavailable";
  }
  const supportingUnavailable = dependencies.some(
    (dependency) =>
      dependency.criticality === "supporting" &&
      dependency.state === "unavailable"
  );
  if (supportingUnavailable) {
    return "degraded";
  }
  if (dependencies.some((dependency) => dependency.state === "degraded")) {
    return "degraded";
  }
  return "healthy";
}

function readServiceIdentity(): ServiceBuildIdentity {
  return {
    name: API_SERVICE_NAME,
    version: getAppVersion(),
    buildId: getGitCommitSha(),
    buildTimestamp: getBuildTimestamp(),
    environment: getNodeEnv(),
  };
}

/**
 * The probes are a seam, not an afterthought: a caller (or a test) supplies the
 * same dependency set the production route builds, so cache and datastore
 * outages are exercised through the interface callers actually use.
 */
export interface HealthProbes {
  readonly database: () => Promise<ProbeResult>;
  readonly cache: () => Promise<ProbeResult>;
}

export interface ReadPlatformHealthOptions {
  readonly platformPrisma: PrismaClient;
  readonly emailQueue: EmailQueueClient;
  readonly probes?: HealthProbes;
  readonly config?: PlatformRuntimeConfig;
}

const DEFAULT_PROBES: HealthProbes = {
  database: () => probeDatabase(),
  cache: () => probeRedis(),
};

/** One bounded read of every dependency, with a last-checked time per row. */
export async function readPlatformHealth(
  options: ReadPlatformHealthOptions
): Promise<PlatformHealthSnapshot> {
  const checkedAt = new Date();
  const probes = options.probes ?? DEFAULT_PROBES;
  const config = options.config ?? readPlatformRuntimeConfig();
  const [database, cache] = await Promise.all([
    probes.database(),
    probes.cache(),
  ]);
  const queues = await readQueueMetrics({
    prisma: options.platformPrisma,
    now: checkedAt,
    emailQueue: options.emailQueue,
  });

  const dependencies: DependencyHealth[] = [
    probeDependency({
      name: "database",
      probe: database,
      description: "PostgreSQL core datastore",
      checkedAt,
      criticality: "critical",
    }),
    probeDependency({
      name: "cache",
      probe: cache,
      description: "Redis cache",
      checkedAt,
      criticality: "supporting",
    }),
    queueDependency(queues.queues, checkedAt),
  ];
  const identity = readServiceIdentity();
  const services: ServiceBuildIdentity[] = [identity];
  if (config.buildIdentity !== null) {
    services.push({
      name: PLATFORM_DASHBOARD_SERVICE_NAME,
      // The dashboard's own version is not configured today, and copying the
      // API's would be a fabricated identity (FR-034).
      version: UNKNOWN_SERVICE_VERSION,
      buildId: config.buildIdentity.buildId,
      buildTimestamp: config.buildIdentity.buildTimestamp,
      environment: identity.environment,
    });
  }

  return {
    overall: worstHealthState(dependencies),
    dependencies,
    services,
    version: identity.version,
    buildTimestamp: identity.buildTimestamp,
    environment: identity.environment,
    errorTrackingUrl: config.errorTrackingUrl,
    checkedAt: checkedAt.toISOString(),
  };
}
