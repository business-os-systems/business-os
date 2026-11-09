"use client";

import { CatalogFormAlert } from "@/components/catalogs/catalog-form-alert";
import { ConfigFormRenderer } from "@/components/forms/config-form-renderer";
import type { ConfigFormField } from "@/components/forms/config-form.types";
import {
  retireConfirmationField,
  type RetireConfirmationValues,
} from "@/components/forms/catalog-value-form.config";
import type {
  CatalogStatusFormController,
  CatalogValueStatusMode,
} from "./use-catalog-status-form";

function confirmationFields(
  mode: CatalogValueStatusMode,
  code: string,
): readonly ConfigFormField<RetireConfirmationValues>[] {
  return mode === "retire" ? retireConfirmationField(code) : [];
}

interface CatalogValueStatusFormProps {
  readonly mode: CatalogValueStatusMode;
  readonly code: string;
  readonly form: CatalogStatusFormController;
  readonly formId: string;
  readonly onReload: () => void;
}

export function CatalogValueStatusForm({
  mode,
  code,
  form,
  formId,
  onReload,
}: CatalogValueStatusFormProps) {
  return (
    <form
      id={formId}
      onSubmit={(event) => {
        event.preventDefault();
        void form.submit();
      }}
      className="space-y-3"
    >
      <CatalogFormAlert
        error={form.mutation.error}
        cause={form.mutation.cause}
        onReload={onReload}
      />
      <ConfigFormRenderer
        fields={confirmationFields(mode, code)}
        values={form.values}
        errors={form.errors}
        disabled={form.mutation.isSaving}
        formId={formId}
        onChange={form.updateField}
      />
    </form>
  );
}
