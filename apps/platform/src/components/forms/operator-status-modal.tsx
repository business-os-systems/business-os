"use client";

import { useId, useState } from "react";
import { Alert, Button, Modal } from "@suite/ui";
import { updateOperatorStatus, type OperatorSummary } from "@/lib/operators-api";
import { useIdempotentMutation } from "@/lib/use-idempotent-mutation";
import { OPERATOR_STATUS_PRESENTATION } from "@/components/operators/operator-presentation";
import { ConfigFormRenderer } from "./config-form-renderer";
import {
  OPERATOR_STATUS_ACTIONS,
  buildOperatorStatusBody,
  operatorStatusFormFields,
  validateOperatorStatusForm,
  type OperatorStatusAction,
  type OperatorStatusActionConfig,
  type OperatorStatusFormErrors,
  type OperatorStatusFormValues,
} from "./operator-status.config";

interface OperatorStatusModalProps {
  readonly operator: OperatorSummary;
  readonly action: OperatorStatusAction;
  readonly onClose: () => void;
  readonly onApplied: (operator: OperatorSummary) => void;
}

interface StatusMutationOptions {
  readonly operator: OperatorSummary;
  readonly action: OperatorStatusAction;
  readonly onApplied: (operator: OperatorSummary) => void;
}

function useStatusMutation({ operator, action, onApplied }: StatusMutationOptions) {
  const [values, setValues] = useState<OperatorStatusFormValues>({ reason: "" });
  const [errors, setErrors] = useState<OperatorStatusFormErrors>({});
  const mutation = useIdempotentMutation();
  const isReady = Object.keys(validateOperatorStatusForm(values)).length === 0;

  function updateReason(name: keyof OperatorStatusFormValues, value: string): void {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors({});
  }

  async function submit(): Promise<void> {
    const nextErrors = validateOperatorStatusForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    await mutation.run(
      (idempotencyKey) =>
        updateOperatorStatus({
          operatorId: operator.id,
          body: buildOperatorStatusBody({
            action,
            values,
            expectedStatus: operator.status,
          }),
          idempotencyKey,
        }),
      onApplied,
    );
  }

  return {
    values,
    errors,
    isSubmitting: mutation.isSaving,
    error: mutation.error,
    isReady,
    updateReason,
    submit,
  };
}

interface StatusModalFooterProps {
  readonly formId: string;
  readonly config: OperatorStatusActionConfig;
  readonly isSubmitting: boolean;
  readonly isReady: boolean;
  readonly onClose: () => void;
}

function StatusModalFooter({
  formId,
  config,
  isSubmitting,
  isReady,
  onClose,
}: StatusModalFooterProps) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" disabled={isSubmitting} onClick={onClose}>
        Cancel
      </Button>
      <Button
        type="submit"
        form={formId}
        variant={config.variant}
        isLoading={isSubmitting}
        disabled={isSubmitting || !isReady}
      >
        {isSubmitting ? config.pendingLabel : config.confirmLabel}
      </Button>
    </div>
  );
}

export function OperatorStatusModal({
  operator,
  action,
  onClose,
  onApplied,
}: OperatorStatusModalProps) {
  const formId = useId();
  const config = OPERATOR_STATUS_ACTIONS[action];
  const fields = operatorStatusFormFields(action);
  const mutation = useStatusMutation({ operator, action, onApplied });

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!mutation.isSubmitting) onClose();
      }}
      title={config.confirmLabel}
      description={`${operator.displayName} (${operator.email}) - ${OPERATOR_STATUS_PRESENTATION[operator.status].label}. ${config.description}`}
      size="lg"
      footer={
        <StatusModalFooter
          formId={formId}
          config={config}
          isSubmitting={mutation.isSubmitting}
          isReady={mutation.isReady}
          onClose={onClose}
        />
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void mutation.submit();
        }}
        className="space-y-3"
      >
        {mutation.error === null ? null : (
          <Alert variant="error" message={mutation.error} />
        )}
        <ConfigFormRenderer
          fields={fields}
          values={mutation.values}
          errors={mutation.errors}
          disabled={mutation.isSubmitting}
          formId={formId}
          onChange={mutation.updateReason}
        />
      </form>
    </Modal>
  );
}
