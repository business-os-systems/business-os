import {
  SYSTEM_API_PATHS,
  platformHealthSchema,
  queueMetricsSchema,
  type PlatformHealth,
  type QueueMetrics,
} from "@suite/core";
import type { z } from "zod";
import { platformFetch, readSuccessData } from "./api";
import { toProblemError } from "./problem-error";

/**
 * Platform system telemetry client. Schemas, state tuples and paths come from
 * the shared @suite/core contract; this module only owns transport.
 */

export {
  DEPENDENCY_CRITICALITIES,
  HEALTH_STATES,
  QUEUE_KINDS,
  QUEUE_STATES,
  SYSTEM_API_PATHS,
} from "@suite/core";
export type {
  DependencyCriticality,
  DependencyHealth,
  HealthState,
  PlatformHealth,
  QueueKind,
  QueueMetric,
  QueueMetrics,
  ServiceBuildIdentity,
} from "@suite/core";

/**
 * The API validates the console URL, but the UI must not inherit that trust:
 * the value ends up in an anchor href, so the sink re-checks the scheme.
 */
export function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

async function readTelemetry<T>(
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal
): Promise<T> {
  const response = await platformFetch(
    path,
    signal === undefined ? {} : { signal }
  );
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, schema);
}

export function fetchPlatformHealth(
  signal?: AbortSignal
): Promise<PlatformHealth> {
  return readTelemetry(SYSTEM_API_PATHS.health, platformHealthSchema, signal);
}

export function fetchQueueMetrics(signal?: AbortSignal): Promise<QueueMetrics> {
  return readTelemetry(SYSTEM_API_PATHS.queues, queueMetricsSchema, signal);
}
