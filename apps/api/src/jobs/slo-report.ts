import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import client from "prom-client";
import { logger, scrubStringValues } from "@suite/logger";
import { getDashboardUrl, getPublicApiUrl } from "../lib/env.js";
import { metricsRegistry } from "../telemetry.js";

/**
 * Availability SLO reporting (FR-142, SC-017). The probe is a plain HTTP
 * request to public URLs, so it measures the deployment from outside the
 * process; a job runner schedules it monthly. The ratio is exported as a
 * metric for the operator dashboards and logged with the failing check.
 */
export const AVAILABILITY_SLO_TARGET = 0.999;
export const SLO_CHECK_TIMEOUT_MS = 5000;

export interface AvailabilityCheck {
  readonly name: string;
  readonly url: string;
}

export interface AvailabilityCheckResult {
  readonly name: string;
  readonly url: string;
  readonly ok: boolean;
  readonly statusCode: number | null;
  readonly durationMs: number;
  readonly error: string | null;
}

export interface SloReport {
  readonly month: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly target: number;
  readonly totalChecks: number;
  readonly successfulChecks: number;
  readonly availability: number;
  readonly met: boolean;
  readonly generatedAt: string;
  readonly results: readonly AvailabilityCheckResult[];
}

export const sloAvailabilityGauge = new client.Gauge({
  name: "suite_slo_availability_ratio",
  help: "Measured availability ratio against the 99.9% monthly target",
  labelNames: ["month"],
  registers: [metricsRegistry],
});

export const sloCheckCounter = new client.Counter({
  name: "suite_slo_checks_total",
  help: "External availability checks by target and outcome",
  labelNames: ["check", "outcome"],
  registers: [metricsRegistry],
});

/** The calendar month in UTC, which is the window SC-017 names. */
export function monthlyWindow(now: Date): {
  readonly label: string;
  readonly start: Date;
  readonly end: Date;
} {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    label: start.toISOString().slice(0, 7),
    start,
    end,
  };
}

export function computeAvailability(results: readonly AvailabilityCheckResult[]): number {
  if (results.length === 0) {
    return 0;
  }
  const successful = results.filter((result) => result.ok).length;
  return successful / results.length;
}

function failureMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return scrubStringValues(detail);
}

export async function runAvailabilityCheck(
  check: AvailabilityCheck,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = SLO_CHECK_TIMEOUT_MS,
): Promise<AvailabilityCheckResult> {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(check.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "business-os-slo-probe" },
    });
    return {
      name: check.name,
      url: check.url,
      ok: response.ok,
      statusCode: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      error: response.ok ? null : "HTTP " + String(response.status),
    };
  } catch (error: unknown) {
    return {
      name: check.name,
      url: check.url,
      ok: false,
      statusCode: null,
      durationMs: Math.round(performance.now() - startedAt),
      error: failureMessage(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface RunSloReportOptions {
  readonly checks: readonly AvailabilityCheck[];
  readonly fetchImpl?: typeof fetch;
  readonly now?: Date;
  readonly target?: number;
  readonly timeoutMs?: number;
}

export async function runSloReport(options: RunSloReportOptions): Promise<SloReport> {
  const now = options.now ?? new Date();
  const window = monthlyWindow(now);
  const results = await Promise.all(
    options.checks.map((check) =>
      runAvailabilityCheck(check, options.fetchImpl ?? fetch, options.timeoutMs),
    ),
  );
  const availability = computeAvailability(results);
  const target = options.target ?? AVAILABILITY_SLO_TARGET;
  const report: SloReport = {
    month: window.label,
    windowStart: window.start.toISOString(),
    windowEnd: window.end.toISOString(),
    target,
    totalChecks: results.length,
    successfulChecks: results.filter((result) => result.ok).length,
    availability,
    met: availability >= target,
    generatedAt: now.toISOString(),
    results,
  };

  for (const result of results) {
    sloCheckCounter.inc({
      check: result.name,
      outcome: result.ok ? "success" : "failure",
    });
  }
  sloAvailabilityGauge.set({ month: window.label }, availability);

  if (!report.met) {
    logger.warn(report, "Availability SLO is below the monthly target");
  }
  return report;
}

/** Public URLs the deployment serves; a relative API URL cannot be probed. */
export function defaultAvailabilityChecks(): readonly AvailabilityCheck[] {
  const apiBase = getPublicApiUrl().replace(/\/$/, "");
  if (!/^https?:\/\//.test(apiBase)) {
    throw new Error(
      "API_URL must be an absolute URL so the SLO probe measures the deployment externally.",
    );
  }
  return [
    { name: "api-health", url: apiBase + "/health" },
    { name: "workspace", url: getDashboardUrl() + "/" },
  ];
}

export async function main(options: RunSloReportOptions): Promise<void> {
  const report = await runSloReport(options);
  logger.info(report, "Monthly availability SLO report");
  if (!report.met) {
    process.exitCode = 1;
  }
}

/* c8 ignore start -- CLI bootstrap runs only when the file is executed directly */
const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  main({ checks: defaultAvailabilityChecks() }).catch((error: unknown) => {
    console.error("SLO report failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* c8 ignore stop */
