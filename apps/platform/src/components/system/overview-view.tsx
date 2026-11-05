import Link from "next/link";
import { Card, CardContent } from "@suite/ui";
import { TelemetryFrame, type ReadyView } from "./telemetry-frame";
import {
  INLINE_LINK_CLASS,
  TELEMETRY_STATE_PRESENTATION,
  formatTimestamp,
} from "./system.config";
import type { TelemetryView } from "./use-system-telemetry";

export interface OverviewViewProps {
  readonly view: TelemetryView;
  readonly isRefreshing: boolean;
  readonly onRefresh: () => void;
}

interface DependencyStateCardProps {
  readonly dependency: ReadyView["health"]["dependencies"][number];
}

function DependencyStateCard({ dependency }: DependencyStateCardProps) {
  const presentation = TELEMETRY_STATE_PRESENTATION[dependency.state];
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-sm font-medium text-text">{dependency.name}</p>
        <p className={`text-sm font-semibold ${presentation.textClassName}`}>
          {presentation.label}
        </p>
        <p className="text-xs text-text-muted">
          checked {formatTimestamp(dependency.lastCheckedAt)}
        </p>
      </CardContent>
    </Card>
  );
}

export function OverviewView({ view, isRefreshing, onRefresh }: OverviewViewProps) {
  return (
    <TelemetryFrame
      view={view}
      isRefreshing={isRefreshing}
      onRefresh={onRefresh}
    >
      {(ready) => (
        <>
          <p className="text-xs text-text-muted">
            {ready.health.environment} · version {ready.health.version} ·{" "}
            {ready.health.services
              .map((service) => `${service.name} build ${service.buildId}`)
              .join(" · ")}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {ready.health.dependencies.map((dependency) => (
              <DependencyStateCard
                key={dependency.name}
                dependency={dependency}
              />
            ))}
          </div>
          <p className="text-sm text-text-secondary">
            <Link href="/system" className={INLINE_LINK_CLASS}>
              Open the system page
            </Link>{" "}
            for per-queue detail, the deployed build and the external error
            console.
          </p>
        </>
      )}
    </TelemetryFrame>
  );
}
