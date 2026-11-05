import { z } from "zod";

/**
 * The system telemetry wire contract, shared by the admin route (which serves
 * it) and the Platform client (which parses it). Keeping it here removes the
 * copy-per-tier drift the contract suite can only catch after the fact.
 */

export const HEALTH_STATES = ["healthy", "degraded", "unavailable"] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

export const DEPENDENCY_CRITICALITIES = ["critical", "supporting"] as const;
export type DependencyCriticality = (typeof DEPENDENCY_CRITICALITIES)[number];

export const QUEUE_STATES = ["healthy", "degraded", "unavailable"] as const;
export type QueueState = (typeof QUEUE_STATES)[number];

export const QUEUE_KINDS = ["bullmq", "outbox"] as const;
export type QueueKind = (typeof QUEUE_KINDS)[number];

export const SYSTEM_API_PATHS = {
  health: "/api/v1/admin/system/health",
  queues: "/api/v1/admin/system/queues",
} as const;

const timestampSchema = z.string().datetime();
const countSchema = z.number().int().nonnegative().nullable();
const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
    message: "must be an absolute http(s) URL",
  });

export const dependencyHealthSchema = z.object({
  name: z.string(),
  state: z.enum(HEALTH_STATES),
  criticality: z.enum(DEPENDENCY_CRITICALITIES),
  latencyMs: z.number().nullable(),
  lastCheckedAt: timestampSchema,
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
  errorTrackingUrl: httpUrlSchema.nullable(),
  checkedAt: timestampSchema,
});

export const queueMetricSchema = z.object({
  name: z.string(),
  kind: z.enum(QUEUE_KINDS),
  waiting: countSchema,
  active: countSchema,
  failed: countSchema,
  delayed: countSchema,
  oldestFailedAgeMs: countSchema,
  state: z.enum(QUEUE_STATES),
  detail: z.string(),
});

export const queueMetricsSchema = z.object({
  queues: z.array(queueMetricSchema),
  checkedAt: timestampSchema,
});

export type DependencyHealth = z.infer<typeof dependencyHealthSchema>;
export type ServiceBuildIdentity = z.infer<typeof serviceBuildIdentitySchema>;
export type PlatformHealth = z.infer<typeof platformHealthSchema>;
export type QueueMetric = z.infer<typeof queueMetricSchema>;
export type QueueMetrics = z.infer<typeof queueMetricsSchema>;
