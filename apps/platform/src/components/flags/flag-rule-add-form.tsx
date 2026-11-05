"use client";

import { useId, useState } from "react";
import { Button } from "@suite/ui";
import type { FlagRuleBody } from "@/lib/flags-api";
import { ConfigFormRenderer } from "@/components/forms/config-form-renderer";
import type { ConfigFormErrors } from "@/components/forms/config-form.types";
import {
  EMPTY_FLAG_RULE_FORM,
  buildRuleInput,
  flagRuleFormFields,
  validateRuleForm,
  type FlagRuleFormValues,
} from "./flag-rule.config";

interface FlagRuleAddFormProps {
  readonly disabled: boolean;
  readonly onAdd: (rule: FlagRuleBody) => boolean;
}

export function FlagRuleAddForm({ disabled, onAdd }: FlagRuleAddFormProps) {
  const formId = useId();
  const [values, setValues] = useState<FlagRuleFormValues>(EMPTY_FLAG_RULE_FORM);
  const [errors, setErrors] = useState<ConfigFormErrors<FlagRuleFormValues>>({});

  function updateField(name: keyof FlagRuleFormValues, value: string): void {
    setValues((current) =>
      name === "ruleType"
        ? { ...current, ruleType: value, targetId: "" }
        : { ...current, [name]: value }
    );
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
      if (name === "ruleType") {
        delete next.targetId;
      }
      return next;
    });
  }

  function add(): void {
    const nextErrors = validateRuleForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    if (onAdd(buildRuleInput(values))) {
      setValues(EMPTY_FLAG_RULE_FORM);
    }
  }

  return (
    <form
      id={formId}
      onSubmit={(event) => {
        event.preventDefault();
        add();
      }}
      className="space-y-2 rounded-lg border border-border p-3"
    >
      <p className="text-xs font-medium text-text-secondary">Add a rule</p>
      <ConfigFormRenderer
        fields={flagRuleFormFields(values.ruleType)}
        values={values}
        errors={errors}
        disabled={disabled}
        formId={formId}
        onChange={updateField}
      />
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={disabled}>
          Add rule
        </Button>
      </div>
    </form>
  );
}
