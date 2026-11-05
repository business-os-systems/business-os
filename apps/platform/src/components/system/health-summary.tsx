import type { DependencyHealth } from "@/lib/system-api";
import {
  CRITICALITY_LABELS,
  TELEMETRY_STATE_PRESENTATION,
  formatLatency,
  formatTimestamp,
} from "./system.config";

export interface HealthSummaryProps {
  readonly dependencies: readonly DependencyHealth[];
}

/** One row per probed dependency: state as text, never colour alone. */
export function HealthSummary({ dependencies }: HealthSummaryProps) {
  return (
    <ul className="divide-y divide-border" aria-label="Health dependencies">
      {dependencies.map((dependency) => {
        const presentation = TELEMETRY_STATE_PRESENTATION[dependency.state];
        return (
          <li
            key={dependency.name}
            className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto]"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-text">{dependency.name}</p>
              <p className="text-xs text-text-secondary">{dependency.detail}</p>
            </div>
            <div className="sm:text-right">
              <p className={`text-sm font-semibold ${presentation.textClassName}`}>
                {presentation.label}
              </p>
              <p className="text-xs text-text-muted">
                {CRITICALITY_LABELS[dependency.criticality]} ·{" "}
                {formatLatency(dependency.latencyMs)} · checked{" "}
                {formatTimestamp(dependency.lastCheckedAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
