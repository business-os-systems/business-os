import { TelemetryCard } from "./telemetry-card";
import { TelemetryFrame } from "./telemetry-frame";
import { ErrorTrackingLink } from "./error-tracking-link";
import { HealthSummary } from "./health-summary";
import { ProvenancePanel } from "./provenance-panel";
import { QueueSummary } from "./queue-summary";
import type { TelemetryView } from "./use-system-telemetry";

export interface SystemViewProps {
  readonly view: TelemetryView;
  readonly isRefreshing: boolean;
  readonly onRefresh: () => void;
}

export function SystemView({ view, isRefreshing, onRefresh }: SystemViewProps) {
  return (
    <TelemetryFrame
      view={view}
      isRefreshing={isRefreshing}
      onRefresh={onRefresh}
    >
      {(ready) => (
        <>
          <TelemetryCard title="Provenance">
            <ProvenancePanel
              overall={ready.health.overall}
              environment={ready.health.environment}
              version={ready.health.version}
              checkedAt={ready.health.checkedAt}
              services={ready.health.services}
            />
          </TelemetryCard>
          <TelemetryCard title="Dependencies">
            <HealthSummary dependencies={ready.health.dependencies} />
          </TelemetryCard>
          <TelemetryCard title="Queues">
            <QueueSummary
              queues={ready.queues.queues}
              checkedAt={ready.queues.checkedAt}
            />
          </TelemetryCard>
          <TelemetryCard title="Error tracking">
            <ErrorTrackingLink href={ready.health.errorTrackingUrl} />
          </TelemetryCard>
        </>
      )}
    </TelemetryFrame>
  );
}
