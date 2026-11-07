"use client";

import { Alert } from "@suite/ui";
import { ConfigFormRenderer } from "@/components/forms/config-form-renderer";
import type { quotaCreateFormFields } from "@/components/quotas/quotas.config";
import type { QuotaFormState } from "./use-quota-form";

interface QuotaEditorFormProps {
  readonly formId: string;
  readonly form: QuotaFormState;
  readonly fields: ReturnType<typeof quotaCreateFormFields>;
}

export function QuotaEditorForm({
  formId,
  form,
  fields,
}: QuotaEditorFormProps) {
  return (
    <form
      id={formId}
      onSubmit={(event) => {
        event.preventDefault();
        void form.save();
      }}
      className="space-y-3"
    >
      {form.mutation.error === null ? null : (
        <Alert variant="error" message={form.mutation.error} />
      )}
      <ConfigFormRenderer
        fields={fields}
        values={form.values}
        errors={form.errors}
        disabled={form.mutation.isSaving}
        formId={formId}
        onChange={form.updateField}
      />
    </form>
  );
}
