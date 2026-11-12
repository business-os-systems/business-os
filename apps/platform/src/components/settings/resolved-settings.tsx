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

/**
 * The API resolves every declared field, so a missing value or source is a
 * contract breach, not an empty setting. Failing loudly keeps a schema/source
 * drift visible instead of silently labelling it "schema".
 */
function ResolvedSettingRow({
  field,
  value,
  source,
}: {
  readonly field: SettingsFieldDefinition;
  readonly value: unknown;
  readonly source: SettingsValueSource;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-border py-2 last:border-b-0 sm:grid-cols-3 sm:gap-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {field.label}
      </dt>
      <dd className="text-sm text-text">{displayValue(field, value)}</dd>
      <dd className="text-xs text-text-secondary sm:text-right">
        {SOURCE_LABELS[source]}
      </dd>
    </div>
  );
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
  // A deployment skew can expose a newer compiled schema than the API that
  // resolved the values. Only the fields the response actually resolved are
  // rendered; the editor's stale-field alert still names the rest, so nothing
  // is silently invented.
  const resolvedFields = fields.flatMap((field) => {
    const value = values[field.key];
    const source = sources[field.key];
    return value === undefined || source === undefined
      ? []
      : [{ field, value, source }];
  });
  const unresolvedCount = fields.length - resolvedFields.length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Effective settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {unresolvedCount > 0 ? (
          <p className="text-xs text-text-muted">
            {unresolvedCount} declared setting(s) were not resolved by this
            deployment.
          </p>
        ) : null}
        <dl>
          {resolvedFields.map(({ field, value, source }) => (
            <ResolvedSettingRow
              key={field.key}
              field={field}
              value={value}
              source={source}
            />
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
