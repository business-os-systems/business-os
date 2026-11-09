"use client";

import { useId } from "react";
import { Button, Modal } from "@suite/ui";
import { useConfigForm } from "@/components/forms/use-config-form";
import { useIdempotentMutation } from "@/lib/use-idempotent-mutation";
import {
  startSupportSession,
  type StartSupportSessionResult,
} from "@/lib/support-session-api";
import { StartSupportSessionForm } from "./start-support-session-form";
import {
  EMPTY_SUPPORT_SESSION_FORM,
  SUPPORT_SESSION_COPY,
  buildStartSupportSessionBody,
  validateSupportSessionForm,
  type SupportSessionFormValues,
} from "./support-session-form.config";

interface StartSupportSessionModalProps {
  readonly organizationId: string;
  readonly onClose: () => void;
  readonly onStarted: (result: StartSupportSessionResult) => void;
}

function StartSupportSessionFooter({
  formId,
  isSaving,
  onClose,
}: {
  readonly formId: string;
  readonly isSaving: boolean;
  readonly onClose: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" disabled={isSaving} onClick={onClose}>
        Cancel
      </Button>
      <Button
        type="submit"
        form={formId}
        isLoading={isSaving}
        disabled={isSaving}
      >
        {isSaving ? SUPPORT_SESSION_COPY.starting : SUPPORT_SESSION_COPY.start}
      </Button>
    </div>
  );
}

export function StartSupportSessionModal({
  organizationId,
  onClose,
  onStarted,
}: StartSupportSessionModalProps) {
  const formId = useId();
  const form = useConfigForm<SupportSessionFormValues>({
    initialValues: EMPTY_SUPPORT_SESSION_FORM,
  });
  const mutation = useIdempotentMutation();

  async function save(): Promise<void> {
    const errors = validateSupportSessionForm(form.values);
    form.setErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    await mutation.run(
      (idempotencyKey) =>
        startSupportSession({
          ...buildStartSupportSessionBody(organizationId, form.values),
          idempotencyKey,
        }),
      onStarted,
    );
  }

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!mutation.isSaving) onClose();
      }}
      title={SUPPORT_SESSION_COPY.start}
      description="The workspace sees a persistent banner for the session's lifetime. The session is read-only and capped at thirty minutes."
      size="xl"
      contentClassName="overflow-visible"
      footer={
        <StartSupportSessionFooter
          formId={formId}
          isSaving={mutation.isSaving}
          onClose={onClose}
        />
      }
    >
      <StartSupportSessionForm
        formId={formId}
        values={form.values}
        errors={form.errors}
        isSaving={mutation.isSaving}
        error={mutation.error}
        onFieldChange={form.updateField}
        onSubmit={() => void save()}
      />
    </Modal>
  );
}
