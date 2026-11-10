"use client";

import { Alert, Button } from "@suite/ui";
import type { AppSettingsView } from "@/lib/app-settings-api";

interface SettingsAlertsProps {
  readonly settings: AppSettingsView;
  readonly removedFields: readonly string[];
  readonly mutationError: string | null;
  readonly conflict: boolean;
  readonly unmappedIssues: readonly {
    readonly name: string;
    readonly reason: string;
  }[];
  readonly onReload: () => void;
}

function UnmappedIssuesAlert({
  issues,
}: {
  readonly issues: SettingsAlertsProps["unmappedIssues"];
}) {
  if (issues.length === 0) return null;
  return (
    <Alert
      variant="warning"
      title="Stored keys rejected by the current schema"
      message={
        <span className="space-y-1">
          {issues.map((issue) => (
            <span key={issue.name} className="block">
              <span className="font-semibold">{issue.name}</span>: {issue.reason}
            </span>
          ))}
        </span>
      }
    />
  );
}

export function SettingsAlerts({
  settings,
  removedFields,
  mutationError,
  conflict,
  unmappedIssues,
  onReload,
}: SettingsAlertsProps) {
  return (
    <>
      {settings.staleFields.length === 0 ? null : (
        <Alert
          variant="warning"
          title="Stored settings no longer match the current schema"
          message={
            <span className="space-y-1">
              {settings.staleFields.map((field) => (
                <span key={field.name} className="block">
                  <span className="font-semibold">{field.name}</span>: {field.reason}
                </span>
              ))}
            </span>
          }
        />
      )}
      {removedFields.length === 0 ? null : (
        <Alert
          variant="info"
          title="Configuration keys removed by the last save"
          message={removedFields.join(", ")}
        />
      )}
      {mutationError === null ? null : (
        <Alert variant="error" message={mutationError} />
      )}
      <UnmappedIssuesAlert issues={unmappedIssues} />
      {conflict ? (
        <Button variant="secondary" size="sm" onClick={onReload}>
          Reload settings
        </Button>
      ) : null}
    </>
  );
}
