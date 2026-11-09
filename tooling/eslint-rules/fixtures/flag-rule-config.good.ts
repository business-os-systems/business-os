interface RuleFormValues {
  readonly ruleType: string;
  readonly targetId: string;
}

interface RuleFieldOption {
  readonly label: string;
  readonly value: string;
}

interface RuleFormField {
  readonly name: keyof RuleFormValues;
  readonly label: string;
  readonly type: "text" | "select";
  readonly required: boolean;
  readonly options?: readonly RuleFieldOption[];
  readonly maxLength?: number;
  readonly placeholder?: string;
  readonly description?: string;
}

const RULE_TYPES = ["tenant", "environment"] as const;
const ENVIRONMENT_OPTIONS: readonly RuleFieldOption[] = [
  { label: "Development", value: "development" },
  { label: "Production", value: "production" },
];

// The shape that must stay valid: a form-field schema, not a presentation
// object. "label" names the input, while name/type/required carry structure.
function targetField(ruleType: string): RuleFormField {
  if (ruleType === RULE_TYPES[1]) {
    return {
      name: "targetId",
      label: "Target environment",
      type: "select",
      required: true,
      options: ENVIRONMENT_OPTIONS,
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

export { targetField };
