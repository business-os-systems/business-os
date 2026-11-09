"use client";

import { CatalogFormAlert } from "@/components/catalogs/catalog-form-alert";
import { ConfigFormRenderer } from "@/components/forms/config-form-renderer";
import {
  CATALOG_VALUE_CREATE_FIELDS,
  CATALOG_VALUE_EDIT_FIELDS,
} from "@/components/forms/catalog-value-form.config";
import type { CatalogValue } from "@/lib/catalogs-api";
import type { CatalogValueFormController } from "./use-catalog-value-form";

interface CatalogValueFormProps {
  readonly value: CatalogValue | null;
  readonly form: CatalogValueFormController;
  readonly formId: string;
  readonly onReload: () => void;
}

export function CatalogValueForm({
  value,
  form,
  formId,
  onReload,
}: CatalogValueFormProps) {
  const fields =
    value === null ? CATALOG_VALUE_CREATE_FIELDS : CATALOG_VALUE_EDIT_FIELDS;
  return (
    <form
      id={formId}
      onSubmit={(event) => {
        event.preventDefault();
        void form.save();
      }}
      className="space-y-3"
    >
      <CatalogFormAlert
        error={form.mutation.error}
        cause={form.mutation.cause}
        onReload={onReload}
      />
      {value === null ? null : (
        <p className="text-xs text-text-muted">
          Code <span className="font-mono text-text">{value.code}</span> ·
          Version {value.version}
        </p>
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
