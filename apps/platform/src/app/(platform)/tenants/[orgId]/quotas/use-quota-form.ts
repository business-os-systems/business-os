"use client";

import { mapInvalidParams } from "@/components/forms/invalid-params";
import { useConfigForm } from "@/components/forms/use-config-form";
import {
  buildQuotaItem,
  toQuotaCreateFormValues,
  toQuotaUpdateFormValues,
  validateQuotaForm,
  type QuotaFormValues,
} from "@/components/quotas/quotas.config";
import { updateTenantQuotas, type QuotaItem } from "@/lib/quotas-api";
import { useIdempotentMutation } from "@/lib/use-idempotent-mutation";
import { readInvalidParams } from "@/lib/problem-error";

const QUOTA_FORM_FIELDS: readonly (keyof QuotaFormValues)[] = [
  "resourceKey",
  "limitValue",
  "isEnforced",
];

export interface QuotaFormState {
  readonly values: ReturnType<typeof toQuotaUpdateFormValues>;
  readonly errors: ReturnType<typeof validateQuotaForm>;
  readonly mutation: ReturnType<typeof useIdempotentMutation>;
  readonly updateField: (
    name: keyof QuotaFormValues,
    value: string
  ) => void;
  readonly save: () => Promise<void>;
}

export function useQuotaForm(
  orgId: string,
  quota: QuotaItem | null,
  availableResources: readonly string[],
  onSaved: (items: readonly QuotaItem[]) => void
): QuotaFormState {
  const form = useConfigForm<QuotaFormValues>({
    initialValues:
      quota === null
        ? toQuotaCreateFormValues(availableResources[0] ?? "")
        : toQuotaUpdateFormValues(quota),
  });
  const { values, setErrors } = form;
  const mutation = useIdempotentMutation();

  async function save(): Promise<void> {
    const nextErrors = validateQuotaForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const outcome = await mutation.run(
      (idempotencyKey) =>
        updateTenantQuotas({
          orgId,
          items: [buildQuotaItem(values, quota?.version ?? null)],
          idempotencyKey,
        }),
      onSaved
    );
    if (!outcome.ok) {
      const issues = readInvalidParams(outcome.error);
      if (issues.length > 0) {
        setErrors(mapInvalidParams(QUOTA_FORM_FIELDS, issues));
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
