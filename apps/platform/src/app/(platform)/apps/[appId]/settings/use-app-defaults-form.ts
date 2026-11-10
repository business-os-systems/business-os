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
  updateAppSettingsDefaults,
  type AppSettingsDefaultsView,
  type AppSettingsDefaultsWriteResult,
} from "@/lib/app-settings-defaults-api";
import { useIdempotentMutation } from "@/lib/use-idempotent-mutation";
import { readInvalidParams } from "@/lib/problem-error";

export interface AppDefaultsFormState {
  readonly values: SettingsFormValues;
  readonly errors: ReturnType<typeof validateSettingsForm>;
  readonly removedFields: readonly string[];
  readonly mutation: ReturnType<typeof useIdempotentMutation>;
  readonly updateField: (name: keyof SettingsFormValues, value: string) => void;
  readonly save: () => Promise<void>;
}

export function useAppDefaultsForm(
  appId: string,
  defaults: AppSettingsDefaultsView,
  onSaved: (result: AppSettingsDefaultsWriteResult) => void,
): AppDefaultsFormState {
  const fieldNames: readonly (keyof SettingsFormValues)[] =
    defaults.schema.fields.map((field) => field.key);
  const form = useConfigForm<SettingsFormValues>({
    initialValues: toSettingsFormValues(
      defaults.schema.fields,
      defaults.values,
    ),
    initialErrors: mapInvalidParams<SettingsFormValues>(
      fieldNames,
      defaults.staleFields,
    ),
  });
  const { values, setValues, setErrors } = form;
  const [removedFields, setRemovedFields] = useState<readonly string[]>([]);
  const mutation = useIdempotentMutation();

  async function save(): Promise<void> {
    const nextErrors = {
      ...mapInvalidParams<SettingsFormValues>(fieldNames, defaults.staleFields),
      ...validateSettingsForm(appId, defaults.schema.fields, values),
    };
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const outcome = await mutation.run(
      (idempotencyKey) =>
        updateAppSettingsDefaults({
          appId,
          values: buildSettingsPayload(defaults.schema.fields, values),
          expectedVersion: defaults.version,
          idempotencyKey,
        }),
      (result) => {
        setValues(
          toSettingsFormValues(defaults.schema.fields, result.values),
        );
        setRemovedFields(result.removedFields);
        onSaved(result);
      },
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
