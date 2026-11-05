"use client";

import { useId, useState } from "react";
import { Alert, Button, Modal } from "@suite/ui";
import { isFlagEnvironment, updateFlag, type FlagRecord } from "@/lib/flags-api";
import { ConfigFormRenderer } from "@/components/forms/config-form-renderer";
import type { ConfigFormErrors } from "@/components/forms/config-form.types";
import {
  FLAG_LIFECYCLE_FORM_FIELDS,
  buildLifecycleUpdate,
  toFlagLifecycleForm,
  validateFlagLifecycleForm,
  type FlagLifecycleFormValues,
} from "./flag-lifecycle.config";
import { useIdempotentMutation } from "@/lib/use-idempotent-mutation";

interface FlagLifecycleModalProps {
  readonly flag: FlagRecord;
  readonly onClose: () => void;
  readonly onSaved: (flag: FlagRecord) => void;
}

export function FlagLifecycleModal({
  flag,
  onClose,
  onSaved,
}: FlagLifecycleModalProps) {
  const formId = useId();
  const [values, setValues] = useState<FlagLifecycleFormValues>(
    toFlagLifecycleForm(flag)
  );
  const [errors, setErrors] = useState<ConfigFormErrors<FlagLifecycleFormValues>>({});
  const mutation = useIdempotentMutation();

  function updateField(name: keyof FlagLifecycleFormValues, value: string): void {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  async function save(): Promise<void> {
    const nextErrors = validateFlagLifecycleForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    const environment = flag.environment;
    if (!isFlagEnvironment(environment)) {
      mutation.setError("The flag environment is not recognised. Reload the flag.");
      return;
    }
    await mutation.run(
      (idempotencyKey) =>
        updateFlag({
          key: flag.key,
          environment,
          body: {
            expectedVersion: flag.version,
            ...buildLifecycleUpdate(values),
            reason: "Update flag lifecycle",
          },
          idempotencyKey,
        }),
      onSaved
    );
  }

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!mutation.isSaving) onClose();
      }}
      title={`Lifecycle — ${flag.key}`}
      description="The owner, expiry and removal ticket keep the flag temporary (OP-8). Extending the expiry is how an expired flag becomes enableable again."
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={mutation.isSaving} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            isLoading={mutation.isSaving}
            disabled={mutation.isSaving}
          >
            Save lifecycle
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="space-y-3"
      >
        {mutation.error !== null ? (
          <Alert variant="error" message={mutation.error} />
        ) : null}
        <ConfigFormRenderer
          fields={FLAG_LIFECYCLE_FORM_FIELDS}
          values={values}
          errors={errors}
          disabled={mutation.isSaving}
          formId={formId}
          onChange={updateField}
        />
      </form>
    </Modal>
  );
}
