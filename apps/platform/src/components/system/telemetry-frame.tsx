import type { ReactNode } from "react";
import { Alert, Button } from "@suite/ui";
import { TelemetryToolbar } from "./telemetry-toolbar";
import {
  TELEMETRY_STATE_PRESENTATION,
  summarizeDependencies,
  summarizeQueues,
} from "./system.config";
import type { TelemetryView } from "./use-system-telemetry";

export type ReadyView = Extract<TelemetryView, { kind: "ready" }>;

export interface TelemetryFrameProps {
  readonly view: TelemetryView;
  readonly isRefreshing: boolean;
  readonly onRefresh: () => void;
  readonly children: (ready: ReadyView) => ReactNode;
}

/**
 * One owner for the telemetry state machine: loading, error with a manual
 * retry, and the ready frame (toolbar plus overall banner). Screens supply only
 * their ready content, so the two pages cannot drift apart.
 */
export function TelemetryFrame({
  view,
  isRefreshing,
  onRefresh,
  children,
}: TelemetryFrameProps) {
  if (view.kind === "loading") {
    return (
      <Alert variant="info" title="Loading" message="Reading platform telemetry…" />
    );
  }
  if (view.kind === "error") {
    return (
      <div className="space-y-3">
        <Alert
          variant="error"
          title="Telemetry unavailable"
          message={view.message}
        />
        <Button variant="secondary" size="sm" onClick={onRefresh}>
          Retry
        </Button>
      </div>
    );
  }

  const overall = TELEMETRY_STATE_PRESENTATION[view.health.overall];

  return (
    <div className="space-y-4">
      <TelemetryToolbar
        receivedAt={view.receivedAt}
        isRefreshing={isRefreshing}
        refreshError={view.refreshError}
        onRefresh={onRefresh}
      />
      <Alert
        variant={overall.alertVariant}
        title={`Platform ${overall.label.toLowerCase()}`}
        message={`${summarizeDependencies(view.health)} ${summarizeQueues(
          view.queues
        )}`}
      />
      {children(view)}
    </div>
  );
}
