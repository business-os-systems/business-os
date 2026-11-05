import type {
  HealthState,
  ServiceBuildIdentity,
} from "@/lib/system-api";
import {
  TELEMETRY_STATE_PRESENTATION,
  formatTimestamp,
} from "./system.config";

export interface ProvenancePanelProps {
  readonly overall: HealthState;
  readonly environment: string;
  readonly version: string;
  readonly checkedAt: string;
  readonly services: readonly ServiceBuildIdentity[];
}

/**
 * Provenance is what makes the numbers trustworthy: which environment, which
 * build, and when the reading was taken (FR-031, FR-034).
 */
export function ProvenancePanel({
  overall,
  environment,
  version,
  checkedAt,
  services,
}: ProvenancePanelProps) {
  const presentation = TELEMETRY_STATE_PRESENTATION[overall];
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-text-muted">Overall</dt>
          <dd className={`font-semibold ${presentation.textClassName}`}>
            {presentation.label}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Environment</dt>
          <dd className="font-medium text-text">{environment}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Version</dt>
          <dd className="font-medium text-text">{version}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Checked</dt>
          <dd className="font-medium text-text">{formatTimestamp(checkedAt)}</dd>
        </div>
      </dl>
      <ul className="space-y-1" aria-label="Running services">
        {services.map((service) => (
          <li key={service.name} className="text-xs text-text-secondary">
            <span className="font-medium text-text">{service.name}</span> ·{" "}
            {service.version} · build {service.buildId} ·{" "}
            {formatTimestamp(service.buildTimestamp)}
          </li>
        ))}
      </ul>
    </div>
  );
}
