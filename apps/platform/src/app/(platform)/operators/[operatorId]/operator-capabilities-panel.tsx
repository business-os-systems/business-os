"use client";

import { useId, useState } from "react";
import { Alert, Button } from "@suite/ui";
import { PLATFORM_CAPABILITY_CODES } from "@suite/core";
import { changeOperatorCapabilities, type OperatorSummary } from "@/lib/operators-api";
import { useIdempotentMutation } from "@/lib/use-idempotent-mutation";
import { ConfigFormRenderer } from "@/components/forms/config-form-renderer";
import type { ConfigFormErrors } from "@/components/forms/config-form.types";
import {
  CAPABILITY_FORM_FIELDS,
  capabilityFormValues,
  describeCapabilityChange,
  planCapabilityChange,
  selectedCapabilities,
  unknownCapabilities,
  type CapabilityChangePlan,
  type CapabilityFormValues,
} from "@/components/forms/capability-form.config";

const NO_ERRORS: ConfigFormErrors<CapabilityFormValues> = {};

interface CapabilityEditorFormProps {
  readonly operatorId: string;
  readonly values: CapabilityFormValues;
  readonly plan: CapabilityChangePlan;
  readonly hasChanges: boolean;
  readonly onFieldChange: (name: keyof CapabilityFormValues, value: string) => void;
  readonly onSaved: (capabilities: readonly string[]) => void;
}

interface CapabilitySaveInput {
  readonly operatorId: string;
  readonly plan: CapabilityChangePlan;
  readonly onSaved: (capabilities: readonly string[]) => void;
}

function useCapabilitySave({ operatorId, plan, onSaved }: CapabilitySaveInput) {
  const mutation = useIdempotentMutation();

  async function save(): Promise<void> {
    if (mutation.isSaving || plan.grant.length + plan.revoke.length === 0) {
      return;
    }
    await mutation.run(
      (idempotencyKey) =>
        changeOperatorCapabilities({
          operatorId,
          grant: plan.grant,
          revoke: plan.revoke,
          idempotencyKey,
        }),
      onSaved,
    );
  }

  return { isSaving: mutation.isSaving, error: mutation.error, save };
}

function CapabilityEditorForm({
  operatorId,
  values,
  plan,
  hasChanges,
  onFieldChange,
  onSaved,
}: CapabilityEditorFormProps) {
  const formId = useId();
  const mutation = useCapabilitySave({ operatorId, plan, onSaved });

  return (
    <form
      id={formId}
      onSubmit={(event) => {
        event.preventDefault();
        void mutation.save();
      }}
      className="space-y-3"
    >
      {mutation.error === null ? null : (
        <Alert variant="error" message={mutation.error} />
      )}
      <ConfigFormRenderer
        fields={CAPABILITY_FORM_FIELDS}
        values={values}
        errors={NO_ERRORS}
        disabled={mutation.isSaving}
        formId={formId}
        onChange={onFieldChange}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-xs text-text-muted">
          {describeCapabilityChange(plan)}
        </span>
        <Button
          type="submit"
          isLoading={mutation.isSaving}
          disabled={!hasChanges || mutation.isSaving}
        >
          Save capabilities
        </Button>
      </div>
    </form>
  );
}

interface OperatorCapabilitiesPanelProps {
  readonly operator: OperatorSummary;
  readonly onApplied: (operator: OperatorSummary, message: string) => void;
}

export function OperatorCapabilitiesPanel({
  operator,
  onApplied,
}: OperatorCapabilitiesPanelProps) {
  const [values, setValues] = useState(() =>
    capabilityFormValues(operator.capabilities),
  );
  const selected = selectedCapabilities(values);
  const plan = planCapabilityChange(operator.capabilities, selected);
  const unknown = unknownCapabilities(operator.capabilities);

  function updateField(name: keyof CapabilityFormValues, value: string): void {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function handleSaved(capabilities: readonly string[]): void {
    setValues(capabilityFormValues(capabilities));
    onApplied(
      { ...operator, capabilities: [...capabilities] },
      "Capabilities updated.",
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-text">Capabilities</h2>
        <span className="text-xs text-text-secondary">
          {selected.length} of {PLATFORM_CAPABILITY_CODES.length} granted
        </span>
      </div>
      <p className="text-xs text-text-muted">
        Only capabilities in the compiled registry can be granted. Absence of a
        capability denies the action.
      </p>
      {unknown.length === 0 ? null : (
        <Alert
          variant="warning"
          title="Unregistered capabilities"
          message={`${unknown.length} stored capability code(s) are not in the compiled registry. They are not shown and cannot be changed here.`}
        />
      )}
      <CapabilityEditorForm
        operatorId={operator.id}
        values={values}
        plan={plan}
        hasChanges={plan.grant.length + plan.revoke.length > 0}
        onFieldChange={updateField}
        onSaved={handleSaved}
      />
    </section>
  );
}
