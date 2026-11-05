"use client";

import { useId, useState } from "react";
import { Alert, Button, Modal } from "@suite/ui";
import { createFlag, type FlagRecord } from "@/lib/flags-api";
import { ConfigFormRenderer } from "@/components/forms/config-form-renderer";
import type { ConfigFormErrors } from "@/components/forms/config-form.types";
import {
  EMPTY_FLAG_FORM,
  FLAG_FORM_FIELDS,
  buildCreateFlagBody,
  validateFlagForm,
  type FlagFormValues,
} from "./flag-form.config";
import { useFlagMutation } from "./use-flag-mutation";

interface FlagCreateModalProps {
  readonly onClose: () => void;
  readonly onCreated: (flag: FlagRecord) => void;
}

export function FlagCreateModal({ onClose, onCreated }: FlagCreateModalProps) {
  const formId = useId();
  const [values, setValues] = useState<FlagFormValues>(EMPTY_FLAG_FORM);
  const [errors, setErrors] = useState<ConfigFormErrors<FlagFormValues>>({});
  const mutation = useFlagMutation();

  function updateField(name: keyof FlagFormValues, value: string): void {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  async function submit(): Promise<void> {
    const nextErrors = validateFlagForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    await mutation.run(
      (idempotencyKey) => createFlag(buildCreateFlagBody(values), idempotencyKey),
      onCreated
    );
  }

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!mutation.isSaving) onClose();
      }}
      title="Create feature flag"
      description="The flag ships off. Use a dot in the key; owner, expiry and removal ticket keep it temporary."
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
            Create flag
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="space-y-2"
      >
        {mutation.error !== null ? (
          <Alert variant="error" message={mutation.error} />
        ) : null}
        <ConfigFormRenderer
          fields={FLAG_FORM_FIELDS}
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
