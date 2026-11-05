/**
 * Response contracts for the Platform system telemetry routes. The schemas are
 * the shared wire contract from @suite/core, so the route and the Platform
 * client cannot drift apart field by field.
 */
export {
  dependencyHealthSchema,
  serviceBuildIdentitySchema,
  platformHealthSchema,
  queueMetricSchema,
  queueMetricsSchema,
} from "@suite/core";
