"use client";

import { Alert, Button, Card, CardContent, CardHeader, CardTitle } from "@suite/ui";
import {
  unmappedInvalidParams,
} from "@/components/forms/invalid-params";
import { ConfigFormRenderer } from "@/components/forms/config-form-renderer";
import {
  buildSettingsFormFields,
  type SettingsFormValues,
} from "@/components/settings/app-settings.config";
import { ResolvedSettings } from "@/components/settings/resolved-settings";
import { SettingsAlerts } from "@/components/settings/settings-alerts";
import type {
  AppSettingsDefaultsView,
  AppSettingsDefaultsWriteResult,
} from "@/lib/app-settings-defaults-api";
import { isConflictError, readInvalidParams } from "@/lib/problem-error";
import {
  useAppDefaultsForm,
  type AppDefaultsFormState,
} from "./use-app-defaults-form";

const FORM_ID = "app-settings-defaults";

function DefaultsEditor({
  canAuthor,
  fields,
  form,
}: {
  readonly canAuthor: boolean;
  readonly fields: ReturnType<typeof buildSettingsFormFields>;
  readonly form: AppDefaultsFormState;
}) {
  if (!canAuthor) {
    return (
      <Alert
        variant="info"
        title="Read-only settings"
        message="Your operator account can read these defaults but cannot change them."
      />
    );
  }
  return (
    <form
      id={FORM_ID}
      onSubmit={(event) => {
        event.preventDefault();
        void form.save();
      }}
      className="space-y-3"
    >
      <ConfigFormRenderer
        fields={fields}
        values={form.values}
        errors={form.errors}
        disabled={form.mutation.isSaving}
        formId={FORM_ID}
        onChange={form.updateField}
      />
      <div className="flex justify-end">
        <Button
          type="submit"
          isLoading={form.mutation.isSaving}
          disabled={form.mutation.isSaving}
        >
          Save defaults
        </Button>
      </div>
    </form>
  );
}

export function AppSettingsDefaultsPanel({
  appId,
  defaults,
  canAuthor,
  onSaved,
  onReload,
}: {
  readonly appId: string;
  readonly defaults: AppSettingsDefaultsView;
  readonly canAuthor: boolean;
  readonly onSaved: (result: AppSettingsDefaultsWriteResult) => void;
  readonly onReload: () => void;
}) {
  const form = useAppDefaultsForm(appId, defaults, onSaved);
  const fields = buildSettingsFormFields(defaults.schema.fields);
  const fieldNames: readonly (keyof SettingsFormValues)[] =
    fields.map((field) => field.name);
  const conflict = isConflictError(form.mutation.cause);
  const invalidParams = readInvalidParams(form.mutation.cause);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settings defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingsAlerts
            settings={defaults}
            removedFields={form.removedFields}
            mutationError={form.mutation.error}
            conflict={conflict}
            unmappedIssues={unmappedInvalidParams<SettingsFormValues>(
              fieldNames,
              invalidParams,
            )}
            onReload={onReload}
          />
          <ResolvedSettings
            fields={defaults.schema.fields}
            values={defaults.effectiveValues}
            sources={defaults.sources}
          />
          <DefaultsEditor canAuthor={canAuthor} fields={fields} form={form} />
        </CardContent>
      </Card>
    </div>
  );
}
