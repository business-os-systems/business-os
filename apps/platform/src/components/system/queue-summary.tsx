import type { QueueMetric } from "@/lib/system-api";
import {
  QUEUE_COUNT_FIELDS,
  QUEUE_KIND_LABELS,
  TELEMETRY_STATE_PRESENTATION,
  formatCount,
  formatFailureAge,
  formatTimestamp,
} from "./system.config";

export interface QueueSummaryProps {
  readonly queues: readonly QueueMetric[];
  readonly checkedAt: string;
}

export function QueueSummary({ queues, checkedAt }: QueueSummaryProps) {
  return (
    <div className="space-y-4">
      {queues.map((queue) => {
        const presentation = TELEMETRY_STATE_PRESENTATION[queue.state];
        return (
          <section
            key={queue.name}
            className="rounded-lg border border-border bg-surface-muted p-3"
            aria-label={`${queue.name} queue`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-text">{queue.name}</p>
                <p className="text-xs text-text-muted">
                  {QUEUE_KIND_LABELS[queue.kind]} · {queue.detail}
                </p>
              </div>
              <p className={`text-sm font-semibold ${presentation.textClassName}`}>
                {presentation.label}
              </p>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
              {QUEUE_COUNT_FIELDS.map((field) => (
                <div key={field.key}>
                  <dt className="text-text-muted">{field.label}</dt>
                  <dd className="font-medium text-text">
                    {formatCount(queue[field.key])}
                  </dd>
                </div>
              ))}
              <div>
                <dt className="text-text-muted">Oldest failure</dt>
                <dd className="font-medium text-text">
                  {formatFailureAge(queue.oldestFailedAgeMs, queue.failed)}
                </dd>
              </div>
            </dl>
          </section>
        );
      })}
      <p className="text-xs text-text-muted">
        Counts read at {formatTimestamp(checkedAt)}.
      </p>
    </div>
  );
}
