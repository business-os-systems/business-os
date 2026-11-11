import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@suite/ui";
import type { WebsiteBuilderConfigurationField } from "@/services/website-builder-settings.service";

function ConfigurationField({
  field,
}: {
  readonly field: WebsiteBuilderConfigurationField;
}) {
  const sourceLabel =
    field.kind === "configured" ? "Workspace configuration" : "Application default";
  return (
    <div className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-text">{field.label}</span>
        <span className="text-xs text-text-muted">{sourceLabel}</span>
      </div>
      <p className="text-xs text-text-secondary">{field.description}</p>
      <p className="mt-1 text-sm font-semibold text-text">{field.displayValue}</p>
    </div>
  );
}

export function WebsiteBuilderSettingsPanel({
  fields,
}: {
  readonly fields: readonly WebsiteBuilderConfigurationField[];
}) {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Settings</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Configuration for the Website Builder application. Sites and inquiries
          live in their own destinations.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Application configuration</CardTitle>
          <CardDescription>
            Values are declared by the application and supplied by the platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <p className="text-sm text-text-muted">
              No configuration is declared for this application.
            </p>
          ) : (
            fields.map((field) => <ConfigurationField key={field.key} field={field} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
