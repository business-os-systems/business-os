"use client";

import { mapInvalidParams } from "@/components/forms/invalid-params";
import { useConfigForm } from "@/components/forms/use-config-form";
import {
  buildCatalogOverrideBody,
  toCatalogOverrideFormValues,
  validateCatalogOverrideForm,
  type CatalogOverrideFormValues,
} from "@/components/apps/apps.config";
import { updateAppCatalogOverride, type CatalogApp } from "@/lib/apps-api";
import { useIdempotentMutation } from "@/lib/use-idempotent-mutation";
import { readInvalidParams } from "@/lib/problem-error";

const CATALOG_FORM_FIELDS: readonly (keyof CatalogOverrideFormValues)[] = [
  "availability",
  "sortOrder",
  "category",
];

export interface CatalogOverrideFormState {
  readonly values: ReturnType<typeof toCatalogOverrideFormValues>;
  readonly errors: ReturnType<typeof validateCatalogOverrideForm>;
  readonly mutation: ReturnType<typeof useIdempotentMutation>;
  readonly updateField: (
    name: keyof CatalogOverrideFormValues,
    value: string
  ) => void;
  readonly save: () => Promise<void>;
}

export function useCatalogOverrideForm(
  app: CatalogApp,
  onSaved: (app: CatalogApp) => void
): CatalogOverrideFormState {
  const form = useConfigForm<CatalogOverrideFormValues>({
    initialValues: toCatalogOverrideFormValues(app),
  });
  const { values, setErrors } = form;
  const mutation = useIdempotentMutation();

  async function save(): Promise<void> {
    const nextErrors = validateCatalogOverrideForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    const outcome = await mutation.run(
      (idempotencyKey) =>
        updateAppCatalogOverride({
          appId: app.appId,
          body: buildCatalogOverrideBody(values, app.version),
          idempotencyKey,
        }),
      onSaved
    );
    if (!outcome.ok) {
      const issues = readInvalidParams(outcome.error);
      if (issues.length > 0) {
        setErrors(mapInvalidParams(CATALOG_FORM_FIELDS, issues));
      }
    }
  }

  return {
    values: form.values,
    errors: form.errors,
    mutation,
    updateField: form.updateField,
    save,
  };
}
