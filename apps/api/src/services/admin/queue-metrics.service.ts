import type { PrismaClient } from "@suite/db";
import { TIMEOUTS } from "@suite/core";
import { logger, scrubStringValues } from "@suite/logger";
import { EMAIL_QUEUE_NAME, getEmailQueue } from "@suite/redis";
import { withTimeout } from "../../lib/with-timeout.js";

/**
 * Queue telemetry for the operator control plane (FR-033, R13).
 *
 * The registry is the one place a new queue is declared. A queue that cannot
 * be read is reported as unavailable with null counts, never as a fabricated
 * zero (SC-021, FR-038). Every read is bounded so a degraded Redis cannot hang
 * the health endpoint.
 */

export const QUEUE_STATES = ["healthy", "degraded", "unavailable"] as const;
export type QueueState = (typeof QUEUE_STATES)[number];

export const QUEUE_KINDS = ["bullmq", "outbox"] as const;
export type QueueKind = (typeof QUEUE_KINDS)[number];

export interface QueueMetric {
  readonly name: string;
  readonly kind: QueueKind;
  readonly waiting: number | null;
  readonly active: number | null;
  readonly failed: number | null;
  readonly delayed: number | null;
  readonly oldestFailedAgeMs: number | null;
  readonly state: QueueState;
  readonly detail: string;
}

export interface QueueMetricsSnapshot {
  readonly queues: QueueMetric[];
  readonly checkedAt: string;
}

export interface QueueHealthSummary {
  readonly state: QueueState;
  readonly detail: string;
}

export type EmailQueueClient = ReturnType<typeof getEmailQueue>;

const OUTBOX_QUEUE_NAME = "platform-outbox";

interface EmptyMetricInput {
  readonly name: string;
  readonly kind: QueueKind;
  readonly detail: string;
}

function emptyMetric(input: EmptyMetricInput): QueueMetric {
  return {
    name: input.name,
    kind: input.kind,
    waiting: null,
    active: null,
    failed: null,
    delayed: null,
    oldestFailedAgeMs: null,
    state: "unavailable",
    detail: input.detail,
  };
}

function failureAgeMs(timestamp: number, now: Date): number | null {
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return Math.max(0, now.getTime() - timestamp);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Reads BullMQ counts and the age of the oldest failed job. */
export async function readBullQueueMetrics(
  queue: EmailQueueClient,
  now: Date,
  timeoutMs: number = TIMEOUTS.QUEUE_METRICS_TIMEOUT_MS
): Promise<QueueMetric> {
  try {
    const counts = await withTimeout(
      queue.getJobCounts("waiting", "active", "failed", "delayed"),
      timeoutMs,
      "BullMQ job counts"
    );
    const failed = counts.failed ?? 0;
    const oldest =
      failed > 0
        ? await withTimeout(
            queue.getJobs(["failed"], 0, 0, true),
            timeoutMs,
            "BullMQ failed jobs"
          )
        : [];
    const oldestFailedAgeMs = failureAgeMs(
      oldest[0]?.timestamp ?? Number.NaN,
      now
    );

    return {
      name: EMAIL_QUEUE_NAME,
      kind: "bullmq",
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      failed,
      delayed: counts.delayed ?? 0,
      oldestFailedAgeMs,
      state: failed > 0 ? "degraded" : "healthy",
      detail: failed > 0 ? `${failed} failed email job(s)` : "Connected",
    };
  } catch (error) {
    logger.warn(
      {
        queue: EMAIL_QUEUE_NAME,
        error: scrubStringValues(errorMessage(error)),
      },
      "Queue metrics unavailable"
    );
    return emptyMetric({
      name: EMAIL_QUEUE_NAME,
      kind: "bullmq",
      detail: "Unavailable",
    });
  }
}

interface OutboxCounts {
  readonly waiting: number;
  readonly active: number;
  readonly failed: number;
}

function countStatus(
  groups: ReadonlyArray<{
    readonly status: string;
    readonly _count: { readonly _all: number };
  }>,
  status: string
): number {
  return groups.find((group) => group.status === status)?._count._all ?? 0;
}

async function readOutboxCounts(prisma: PrismaClient): Promise<OutboxCounts> {
  const groups = await prisma.outboxEvent.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  return {
    waiting: countStatus(groups, "PENDING"),
    active: countStatus(groups, "PROCESSING"),
    failed: countStatus(groups, "DEAD"),
  };
}

/** Reads the transactional outbox, whose DEAD rows are the dead-letter store. */
export async function readOutboxQueueMetrics(
  prisma: PrismaClient,
  now: Date,
  timeoutMs: number = TIMEOUTS.QUEUE_METRICS_TIMEOUT_MS
): Promise<QueueMetric> {
  try {
    const [counts, oldestFailed] = await withTimeout(
      Promise.all([
        readOutboxCounts(prisma),
        prisma.outboxEvent.findFirst({
          where: { status: "DEAD" },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
      ]),
      timeoutMs,
      "Outbox metrics"
    );
    const oldestFailedAgeMs =
      oldestFailed === null
        ? null
        : failureAgeMs(oldestFailed.createdAt.getTime(), now);

    return {
      name: OUTBOX_QUEUE_NAME,
      kind: "outbox",
      waiting: counts.waiting,
      active: counts.active,
      failed: counts.failed,
      delayed: 0,
      oldestFailedAgeMs,
      state: counts.failed > 0 ? "degraded" : "healthy",
      detail:
        counts.failed > 0
          ? `${counts.failed} dead-lettered event(s)`
          : "Connected",
    };
  } catch (error) {
    logger.warn(
      {
        queue: OUTBOX_QUEUE_NAME,
        error: scrubStringValues(errorMessage(error)),
      },
      "Queue metrics unavailable"
    );
    return emptyMetric({
      name: OUTBOX_QUEUE_NAME,
      kind: "outbox",
      detail: "Unavailable",
    });
  }
}

export interface ReadQueueMetricsOptions {
  readonly prisma: PrismaClient;
  readonly now: Date;
  readonly emailQueue: EmailQueueClient;
  readonly timeoutMs?: number;
}

/** Collects every registered queue in one bounded snapshot. */
export async function readQueueMetrics(
  options: ReadQueueMetricsOptions
): Promise<QueueMetricsSnapshot> {
  const timeoutMs = options.timeoutMs ?? TIMEOUTS.QUEUE_METRICS_TIMEOUT_MS;
  const queues = await Promise.all([
    readBullQueueMetrics(options.emailQueue, options.now, timeoutMs),
    readOutboxQueueMetrics(options.prisma, options.now, timeoutMs),
  ]);
  return { queues, checkedAt: options.now.toISOString() };
}

/** Folds queue metrics into one background-processing health state (FR-032). */
export function summarizeQueueHealth(
  queues: readonly QueueMetric[]
): QueueHealthSummary {
  const unavailable = queues.filter((queue) => queue.state === "unavailable");
  if (unavailable.length === queues.length) {
    return {
      state: "unavailable",
      detail: `No queue backend reachable: ${unavailable
        .map((queue) => queue.name)
        .join(", ")}`,
    };
  }
  if (unavailable.length > 0) {
    return {
      state: "degraded",
      detail: `Queue unavailable: ${unavailable
        .map((queue) => queue.name)
        .join(", ")}`,
    };
  }

  const failed = queues.reduce((total, queue) => total + (queue.failed ?? 0), 0);
  if (failed > 0) {
    const oldest = Math.max(
      ...queues.map((queue) => queue.oldestFailedAgeMs ?? 0)
    );
    return {
      state: "degraded",
      detail: `${failed} failed item(s); oldest failure ${Math.round(
        oldest / 1000
      )}s old`,
    };
  }

  return {
    state: "healthy",
    detail: "All queues connected with no failed items",
  };
}
