import { performance } from "node:perf_hooks";
import client from "prom-client";
import { logger, scrubStringValues } from "@suite/logger";
import { metricsRegistry } from "../../telemetry.js";

/**
 * Domain observability for the Website Builder (FR-065, T126). HTTP counters
 * alone cannot answer why a release, a delivery or a form submission failed, so
 * each domain operation records its outcome, its duration and a typed failure
 * context. The labels carry no tenant content and no personal data (OP-11).
 */
export const DOMAIN_OPERATIONS = {
  PUBLISH: "publish",
  DELIVERY: "delivery",
  CATALOG_REFRESH: "catalog_refresh",
  FORM_INGESTION: "form_ingestion",
  VERSION_RETENTION: "version_retention",
} as const;

export type DomainOperation = (typeof DOMAIN_OPERATIONS)[keyof typeof DOMAIN_OPERATIONS];

export const DOMAIN_OUTCOMES = {
  SUCCESS: "success",
  FAILURE: "failure",
} as const;

export type DomainOutcome = (typeof DOMAIN_OUTCOMES)[keyof typeof DOMAIN_OUTCOMES];

/** Bounded identifiers used for diagnosis; never payloads or personal data. */
export type DomainOperationContext = Readonly<Record<string, string | number | boolean>>;

export const domainOperationCounter = new client.Counter({
  name: "suite_domain_operations_total",
  help: "Count of Website Builder domain operations by outcome",
  labelNames: ["operation", "outcome"],
  registers: [metricsRegistry],
});

export const domainOperationDuration = new client.Histogram({
  name: "suite_domain_operation_duration_seconds",
  help: "Duration of Website Builder domain operations in seconds",
  labelNames: ["operation", "outcome"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export function recordDomainOperation(input: {
  readonly operation: DomainOperation;
  readonly outcome: DomainOutcome;
  readonly startedAt: number;
}): void {
  const seconds = Math.max(0, performance.now() - input.startedAt) / 1000;
  domainOperationCounter.inc({
    operation: input.operation,
    outcome: input.outcome,
  });
  domainOperationDuration.observe({ operation: input.operation, outcome: input.outcome }, seconds);
}

/** Logs a failure with enough context to diagnose it, framing it by operation. */
export function recordDomainFailure(
  operation: DomainOperation,
  error: unknown,
  context: DomainOperationContext = {},
): void {
  const detail = error instanceof Error ? error.message : String(error);
  logger.error(
    { operation, ...context, error: scrubStringValues(detail) },
    "Website Builder domain operation failed",
  );
}

/**
 * Times one domain operation and records both outcomes. A failed operation is
 * rethrown unchanged so callers keep their existing problem-details handling.
 */
export async function measureDomainOperation<T>(
  operation: DomainOperation,
  context: DomainOperationContext,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await run();
    recordDomainOperation({
      operation,
      outcome: DOMAIN_OUTCOMES.SUCCESS,
      startedAt,
    });
    return result;
  } catch (error: unknown) {
    recordDomainOperation({
      operation,
      outcome: DOMAIN_OUTCOMES.FAILURE,
      startedAt,
    });
    recordDomainFailure(operation, error, context);
    throw error;
  }
}

/**
 * Times a maintenance step whose failure must not unwind completed work — a
 * prune after a committed release, for example. The failure is counted and
 * logged by the wrapper, and the caller continues.
 */
export async function measureDomainOperationSafely(
  operation: DomainOperation,
  context: DomainOperationContext,
  run: () => Promise<unknown>,
): Promise<void> {
  await measureDomainOperation(operation, context, run).catch(() => undefined);
}
