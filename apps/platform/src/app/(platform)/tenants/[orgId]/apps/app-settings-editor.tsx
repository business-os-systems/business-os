"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@suite/ui";
import { ResolvedSettings } from "@/components/settings/resolved-settings";
import {
  unmappedInvalidParams,
} from "@/components/forms/invalid-params";
import {
  SETTINGS_FORM_ID,
  buildSettingsFormFields,
  type SettingsFormValues,
} from "@/components/settings/app-settings.config";
import type {
  AppSettingsView,
  AppSettingsWriteResult,
} from "@/lib/app-settings-api";
import { isConflictError, readInvalidParams } from "@/lib/problem-error";
import { SettingsAlerts } from "@/components/settings/settings-alerts";
import { SettingsForm } from "./settings-form";
import { useSettingsForm } from "./use-settings-form";

interface AppSettingsEditorProps {
  readonly orgId: string;
  readonly settings: AppSettingsView;
  readonly onSaved: (result: AppSettingsWriteResult) => void;
  readonly onReload: () => void;
}

export function AppSettingsEditor({
  orgId,
  settings,
  onSaved,
  onReload,
}: AppSettingsEditorProps) {
  const formId = SETTINGS_FORM_ID;
  const form = useSettingsForm(orgId, settings, onSaved);
  const fields = buildSettingsFormFields(settings.schema.fields);
  const fieldNames: readonly (keyof SettingsFormValues)[] =
    fields.map((field) => field.name);
  const conflict = isConflictError(form.mutation.cause);
  const invalidParams = readInvalidParams(form.mutation.cause);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{settings.appId} configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <SettingsAlerts
          settings={settings}
          removedFields={form.removedFields}
          mutationError={form.mutation.error}
          conflict={conflict}
          unmappedIssues={unmappedInvalidParams<SettingsFormValues>(
            fieldNames,
            invalidParams
          )}
          onReload={onReload}
        />
        <ResolvedSettings
          fields={settings.schema.fields}
          values={settings.effectiveValues}
          sources={settings.sources}
        />
        <SettingsForm formId={formId} fields={fields} form={form} />
      </CardContent>
    </Card>
  );
}
