"use client";

import { useState } from "react";
import { mapInvalidParams } from "@/components/forms/invalid-params";
import { useConfigForm } from "@/components/forms/use-config-form";
import {
  buildSettingsPayload,
  toSettingsFormValues,
  validateSettingsForm,
  type SettingsFormValues,
} from "@/components/settings/app-settings.config";
import {
  updateAppSettings,
  type AppSettingsView,
  type AppSettingsWriteResult,
} from "@/lib/app-settings-api";
import { useIdempotentMutation } from "@/lib/use-idempotent-mutation";
import { readInvalidParams } from "@/lib/problem-error";

export interface SettingsFormState {
  readonly values: SettingsFormValues;
  readonly errors: ReturnType<typeof validateSettingsForm>;
  readonly removedFields: readonly string[];
  readonly mutation: ReturnType<typeof useIdempotentMutation>;
  readonly updateField: (
    name: keyof SettingsFormValues,
    value: string
  ) => void;
  readonly save: () => Promise<void>;
}

export function useSettingsForm(
  orgId: string,
  settings: AppSettingsView,
  onSaved: (result: AppSettingsWriteResult) => void
): SettingsFormState {
  const fieldNames: readonly (keyof SettingsFormValues)[] =
    settings.schema.fields.map((field) => field.key);
  const form = useConfigForm<SettingsFormValues>({
    initialValues: toSettingsFormValues(settings.schema.fields, settings.values),
    initialErrors: mapInvalidParams<SettingsFormValues>(
      fieldNames,
      settings.staleFields
    ),
  });
  const { values, setValues, setErrors } = form;
  const [removedFields, setRemovedFields] = useState<readonly string[]>([]);
  const mutation = useIdempotentMutation();

  async function save(): Promise<void> {
    const nextErrors = {
      ...mapInvalidParams<SettingsFormValues>(fieldNames, settings.staleFields),
      ...validateSettingsForm(settings.appId, settings.schema.fields, values),
    };
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const outcome = await mutation.run(
      (idempotencyKey) =>
        updateAppSettings({
          orgId,
          appId: settings.appId,
          values: buildSettingsPayload(settings.schema.fields, values),
          expectedVersion: settings.version,
          idempotencyKey,
        }),
      (result) => {
        setValues(toSettingsFormValues(settings.schema.fields, result.values));
        setRemovedFields(result.removedFields);
        onSaved(result);
      }
    );
    if (!outcome.ok) {
      const issues = readInvalidParams(outcome.error);
      if (issues.length > 0) {
        setErrors(mapInvalidParams<SettingsFormValues>(fieldNames, issues));
      }
    }
  }

  return {
    values: form.values,
    errors: form.errors,
    removedFields,
    mutation,
    updateField: form.updateField,
    save,
  };
}
