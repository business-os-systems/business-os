"use client";

import { Alert, Button } from "@suite/ui";
import { ConfigFormRenderer } from "@/components/forms/config-form-renderer";
import { CATALOG_OVERRIDE_FORM_FIELDS } from "@/components/apps/apps.config";
import type { CatalogApp } from "@/lib/apps-api";
import { isConflictError } from "@/lib/problem-error";
import type { CatalogOverrideFormState } from "./use-catalog-override-form";

interface CatalogOverrideFormProps {
  readonly app: CatalogApp;
  readonly formId: string;
  readonly form: CatalogOverrideFormState;
  readonly onClose: () => void;
  readonly onReload: () => void;
}

export function CatalogOverrideForm({
  app,
  formId,
  form,
  onClose,
  onReload,
}: CatalogOverrideFormProps) {
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
      {isConflictError(form.mutation.cause) ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            onClose();
            onReload();
          }}
        >
          Reload catalog
        </Button>
      ) : null}
      <p className="text-xs text-text-muted">
        Version: {app.version ?? "no override yet"} · Installed by{" "}
        {app.installedCount} tenant(s)
      </p>
      <ConfigFormRenderer
        fields={CATALOG_OVERRIDE_FORM_FIELDS}
        values={form.values}
        errors={form.errors}
        disabled={form.mutation.isSaving}
        formId={formId}
        onChange={form.updateField}
      />
    </form>
  );
}
