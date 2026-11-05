import type { ConfigFormErrors, ConfigFormField } from "@/components/forms/config-form.types";
import {
  FLAG_ENVIRONMENT_OPTIONS,
  FLAG_ENVIRONMENTS,
  FLAG_RULE_TYPE_OPTIONS,
  FLAG_RULE_TYPES,
  isFlagRuleType,
  type FlagRuleBody,
} from "@/lib/flags-api";

/** Targeting-rule schema: one row becomes one FlagRuleBody. */

export interface FlagRuleFormValues {
  readonly ruleType: string;
  readonly targetId: string;
  readonly enabled: string;
  readonly priority: string;
}

export const EMPTY_FLAG_RULE_FORM: FlagRuleFormValues = {
  ruleType: FLAG_RULE_TYPES[0],
  targetId: "",
  enabled: "true",
  priority: "0",
};

const RULE_TYPE_FIELD: ConfigFormField<FlagRuleFormValues> = {
  name: "ruleType",
  label: "Rule type",
  type: "select",
  required: true,
  options: FLAG_RULE_TYPE_OPTIONS,
};

const ENABLED_FIELD: ConfigFormField<FlagRuleFormValues> = {
  name: "enabled",
  label: "Value",
  type: "select",
  required: true,
  options: [
    { label: "Enabled", value: "true" },
    { label: "Disabled", value: "false" },
  ],
};

const PRIORITY_FIELD: ConfigFormField<FlagRuleFormValues> = {
  name: "priority",
  label: "Priority",
  type: "text",
  required: true,
  maxLength: 4,
  placeholder: "0",
  description: "Higher priority wins when two rules target the same value.",
};

function targetField(ruleType: string): ConfigFormField<FlagRuleFormValues> {
  if (ruleType === FLAG_RULE_TYPES[1]) {
    return {
      name: "targetId",
      label: "Target environment",
      type: "select",
      required: true,
      options: FLAG_ENVIRONMENT_OPTIONS,
    };
  }
  return {
    name: "targetId",
    label: "Target tenant",
    type: "text",
    required: true,
    maxLength: 128,
    placeholder: "Organization id",
    description: "Paste the tenant's organization ID from the Tenants page.",
  };
}

export function flagRuleFormFields(
  ruleType: string
): readonly ConfigFormField<FlagRuleFormValues>[] {
  return [RULE_TYPE_FIELD, targetField(ruleType), ENABLED_FIELD, PRIORITY_FIELD];
}

export const FLAG_RULE_FORM_FIELDS = flagRuleFormFields(FLAG_RULE_TYPES[0]);

export function validateRuleForm(
  values: FlagRuleFormValues
): ConfigFormErrors<FlagRuleFormValues> {
  const errors: Partial<Record<keyof FlagRuleFormValues, string>> = {};
  if (!isFlagRuleType(values.ruleType)) {
    errors.ruleType = "Choose a rule type.";
  }
  if (values.targetId.trim() === "") {
    errors.targetId = "Enter a target.";
  } else if (values.targetId.trim().length > 128) {
    errors.targetId = "Keep the target within 128 characters.";
  } else if (
    values.ruleType === FLAG_RULE_TYPES[1] &&
    !(FLAG_ENVIRONMENTS as readonly string[]).includes(values.targetId.trim())
  ) {
    errors.targetId =
      "Use one of " + FLAG_ENVIRONMENTS.join(", ") + ".";
  }
  if (values.enabled !== "true" && values.enabled !== "false") {
    errors.enabled = "Choose a value.";
  }
  if (!/^\d{1,4}$/.test(values.priority.trim())) {
    errors.priority = "Use a whole number from 0 to 1000.";
  } else if (Number(values.priority) > 1000) {
    errors.priority = "Use a whole number from 0 to 1000.";
  }
  return errors;
}

export function buildRuleInput(values: FlagRuleFormValues): FlagRuleBody {
  if (!isFlagRuleType(values.ruleType)) {
    throw new Error("Choose a valid rule type.");
  }
  return {
    ruleType: values.ruleType,
    targetId: values.targetId.trim(),
    enabled: values.enabled === "true",
    priority: Number(values.priority),
  };
}
