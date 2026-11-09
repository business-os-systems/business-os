"use client";

import { Button } from "@suite/ui";
import { ConfigFormRenderer } from "@/components/forms/config-form-renderer";
import type { buildSettingsFormFields } from "@/components/settings/app-settings.config";
import type { SettingsFormState } from "./use-settings-form";

interface SettingsFormProps {
  readonly formId: string;
  readonly fields: ReturnType<typeof buildSettingsFormFields>;
  readonly form: SettingsFormState;
}

export function SettingsForm({ formId, fields, form }: SettingsFormProps) {
  return (
    <form
      id={formId}
      onSubmit={(event) => {
        event.preventDefault();
        void form.save();
      }}
      className="space-y-3"
    >
      {fields.length === 0 ? (
        <p className="text-sm text-text-secondary">
          This application declares no settings for a tenant.
        </p>
      ) : (
        <ConfigFormRenderer
          fields={fields}
          values={form.values}
          errors={form.errors}
          disabled={form.mutation.isSaving}
          formId={formId}
          onChange={form.updateField}
        />
      )}
      <div className="flex justify-end">
        <Button
          type="submit"
          isLoading={form.mutation.isSaving}
          disabled={form.mutation.isSaving || fields.length === 0}
        >
          Save settings
        </Button>
      </div>
    </form>
  );
}
