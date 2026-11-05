import type { AlertVariant } from "@suite/ui";
import type {
  DependencyCriticality,
  HealthState,
  PlatformHealth,
  QueueKind,
  QueueMetrics,
} from "@/lib/system-api";

/**
 * Presentation configuration for the system and overview screens. States map to
 * labels and classes through records, never through a branch that returns props
 * (P1); the label is always rendered, colour is an additional signal.
 */

export interface StatePresentation {
  readonly label: string;
  readonly textClassName: string;
  readonly alertVariant: AlertVariant;
}

export const TELEMETRY_STATE_PRESENTATION = {
  healthy: {
    label: "Healthy",
    textClassName: "text-success",
    alertVariant: "success",
  },
  degraded: {
    label: "Degraded",
    textClassName: "text-warning",
    alertVariant: "warning",
  },
  unavailable: {
    label: "Unavailable",
    textClassName: "text-danger",
    alertVariant: "error",
  },
} as const satisfies Record<HealthState, StatePresentation>;

export const CRITICALITY_LABELS = {
  critical: "Critical",
  supporting: "Supporting",
} as const satisfies Record<DependencyCriticality, string>;

export const QUEUE_KIND_LABELS = {
  bullmq: "BullMQ",
  outbox: "Outbox",
} as const satisfies Record<QueueKind, string>;

export interface QueueCountField {
  readonly key: "waiting" | "active" | "failed" | "delayed";
  readonly label: string;
}

export const QUEUE_COUNT_FIELDS = [
  { key: "waiting", label: "Waiting" },
  { key: "active", label: "Active" },
  { key: "failed", label: "Failed" },
  { key: "delayed", label: "Delayed" },
] as const satisfies readonly QueueCountField[];

export const MILLISECONDS_PER_SECOND = 1_000;
export const MILLISECONDS_PER_MINUTE = 60_000;
const MILLISECONDS_PER_HOUR = 3_600_000;
const MILLISECONDS_PER_DAY = 86_400_000;

/** FR-037 requires a refresh at least every sixty seconds. */
export const SYSTEM_REFRESH_INTERVAL_MS = MILLISECONDS_PER_MINUTE;

export const EMPTY_COUNT_LABEL = "—";
export const UNKNOWN_AGE_LABEL = "Age unavailable";

/** One display identity for the control plane; UTC rendering is CT-8. */
export const PLATFORM_DISPLAY_LOCALE = "en-GB";
export const PLATFORM_DISPLAY_TIME_ZONE = "UTC";

/** Shared focus ring for inline links, so the treatment cannot drift. */
export const INLINE_LINK_CLASS =
  "font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(PLATFORM_DISPLAY_LOCALE, {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: PLATFORM_DISPLAY_TIME_ZONE,
});

/** UTC everywhere: a control plane must not render server-local time (CT-8). */
export function formatTimestamp(isoTimestamp: string): string {
  const value = new Date(isoTimestamp);
  if (Number.isNaN(value.getTime())) {
    return "Unknown";
  }
  return `${TIMESTAMP_FORMATTER.format(value)} ${PLATFORM_DISPLAY_TIME_ZONE}`;
}

export function formatLatency(latencyMs: number | null): string {
  if (latencyMs === null) {
    return "Not measured";
  }
  return `${Math.round(latencyMs)} ms`;
}

export function formatCount(value: number | null): string {
  if (value === null) {
    return EMPTY_COUNT_LABEL;
  }
  return String(value);
}

/** Unknown counts never become "no failures" (FR-038). */
export function formatFailureAge(
  ageMs: number | null,
  failed: number | null
): string {
  if (failed === null) {
    return EMPTY_COUNT_LABEL;
  }
  if (failed === 0) {
    return "No failed item";
  }
  if (ageMs === null) {
    return UNKNOWN_AGE_LABEL;
  }
  return formatAge(ageMs);
}

export function formatAge(ageMs: number | null): string {
  if (ageMs === null) {
    return UNKNOWN_AGE_LABEL;
  }
  if (ageMs < MILLISECONDS_PER_MINUTE) {
    return `${Math.round(ageMs / MILLISECONDS_PER_SECOND)}s`;
  }
  if (ageMs < MILLISECONDS_PER_HOUR) {
    return `${Math.round(ageMs / MILLISECONDS_PER_MINUTE)}m`;
  }
  if (ageMs < MILLISECONDS_PER_DAY) {
    return `${Math.round(ageMs / MILLISECONDS_PER_HOUR)}h`;
  }
  return `${Math.round(ageMs / MILLISECONDS_PER_DAY)}d`;
}

export function summarizeDependencies(health: PlatformHealth): string {
  const total = health.dependencies.length;
  const unavailable = health.dependencies.filter(
    (dependency) => dependency.state === "unavailable"
  ).length;
  if (unavailable > 0) {
    return `${unavailable} of ${total} dependencies unavailable.`;
  }
  const degraded = health.dependencies.filter(
    (dependency) => dependency.state === "degraded"
  ).length;
  if (degraded > 0) {
    return `${degraded} of ${total} dependencies degraded.`;
  }
  return `All ${total} dependencies healthy.`;
}

export function summarizeQueues(queues: QueueMetrics): string {
  const unreachable = queues.queues.filter(
    (queue) => queue.state === "unavailable"
  ).length;
  if (unreachable > 0) {
    return `${unreachable} of ${queues.queues.length} queues unreachable.`;
  }
  // A null count is unknown, not zero: folding it to 0 would claim there are no
  // failed items while the backlog is unreadable (FR-038).
  const hasUnknownCount = queues.queues.some(
    (queue) => queue.failed === null
  );
  if (hasUnknownCount) {
    return "Queue counts unavailable.";
  }
  const failed = queues.queues.reduce(
    (total, queue) => total + (queue.failed ?? 0),
    0
  );
  if (failed > 0) {
    return `${failed} failed item(s) across ${queues.queues.length} queues.`;
  }
  return "No failed items across the registered queues.";
}
