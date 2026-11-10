"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@suite/ui";
import type {
  SettingsFieldDefinition,
  SettingsValueSource,
} from "@suite/core";

const SOURCE_LABELS: Readonly<Record<SettingsValueSource, string>> = {
  tenant: "Tenant override",
  app: "Application default",
  schema: "Schema default",
};

function displayValue(field: SettingsFieldDefinition, value: unknown): string {
  switch (field.kind) {
    case "boolean":
      return value === true ? "Enabled" : "Disabled";
    case "text":
      return typeof value === "string" && value.trim() !== ""
        ? value
        : "Not set";
  }
}

export function ResolvedSettings({
  fields,
  values,
  sources,
}: {
  readonly fields: readonly SettingsFieldDefinition[];
  readonly values: Readonly<Record<string, unknown>>;
  readonly sources: Readonly<Record<string, SettingsValueSource>>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Effective settings</CardTitle>
      </CardHeader>
      <CardContent>
        <dl>
          {fields.map((field) => (
            <div
              key={field.key}
              className="grid grid-cols-1 gap-1 border-b border-border py-2 last:border-b-0 sm:grid-cols-3 sm:gap-3"
            >
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                {field.label}
              </dt>
              <dd className="text-sm text-text">{displayValue(field, values[field.key])}</dd>
              <dd className="text-xs text-text-secondary sm:text-right">
                {SOURCE_LABELS[sources[field.key] ?? "schema"]}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
