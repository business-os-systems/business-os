import { z } from "@hono/zod-openapi";
import {
  DEPENDENCY_CRITICALITIES,
  HEALTH_STATES,
} from "../../services/admin/health.service.js";
import {
  QUEUE_KINDS,
  QUEUE_STATES,
} from "../../services/admin/queue-metrics.service.js";

/** Response contracts for the Platform system telemetry routes. */

export const dependencyHealthSchema = z.object({
  name: z.string(),
  state: z.enum(HEALTH_STATES),
  criticality: z.enum(DEPENDENCY_CRITICALITIES),
  latencyMs: z.number().nullable(),
  lastCheckedAt: z.string().datetime(),
  detail: z.string(),
});

export const serviceBuildIdentitySchema = z.object({
  name: z.string(),
  version: z.string(),
  buildId: z.string(),
  buildTimestamp: z.string(),
  environment: z.string(),
});

export const platformHealthSchema = z.object({
  overall: z.enum(HEALTH_STATES),
  dependencies: z.array(dependencyHealthSchema),
  services: z.array(serviceBuildIdentitySchema),
  version: z.string(),
  buildTimestamp: z.string(),
  environment: z.string(),
  checkedAt: z.string().datetime(),
});

export const queueMetricSchema = z.object({
  name: z.string(),
  kind: z.enum(QUEUE_KINDS),
  waiting: z.number().int().nonnegative().nullable(),
  active: z.number().int().nonnegative().nullable(),
  failed: z.number().int().nonnegative().nullable(),
  delayed: z.number().int().nonnegative().nullable(),
  oldestFailedAgeMs: z.number().int().nonnegative().nullable(),
  state: z.enum(QUEUE_STATES),
  detail: z.string(),
});

export const queueMetricsSchema = z.object({
  queues: z.array(queueMetricSchema),
  checkedAt: z.string().datetime(),
});
