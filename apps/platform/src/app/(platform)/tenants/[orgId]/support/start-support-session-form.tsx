"use client";

import { Alert } from "@suite/ui";
import { ConfigFormRenderer } from "@/components/forms/config-form-renderer";
import type { ConfigFormErrors } from "@/components/forms/config-form.types";
import {
  SUPPORT_SESSION_FIELDS,
  type SupportSessionFormValues,
} from "./support-session-form.config";

interface StartSupportSessionFormProps {
  readonly formId: string;
  readonly values: SupportSessionFormValues;
  readonly errors: ConfigFormErrors<SupportSessionFormValues>;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onFieldChange: (
    name: keyof SupportSessionFormValues,
    value: string,
  ) => void;
  readonly onSubmit: () => void;
}

export function StartSupportSessionForm({
  formId,
  values,
  errors,
  isSaving,
  error,
  onFieldChange,
  onSubmit,
}: StartSupportSessionFormProps) {
  return (
    <form
      id={formId}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="space-y-3"
    >
      {error === null ? null : <Alert variant="error" message={error} />}
      <ConfigFormRenderer
        fields={SUPPORT_SESSION_FIELDS}
        values={values}
        errors={errors}
        disabled={isSaving}
        formId={formId}
        onChange={onFieldChange}
      />
    </form>
  );
}
