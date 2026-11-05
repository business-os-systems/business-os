import type { ConfigFormField } from "./config-form.types";
import type {
  OperatorGovernanceStatus,
  OperatorStatus,
} from "@/lib/operators-api";

/** Mirrors updateOperatorStatusBodySchema in the operator contract. */
export const OPERATOR_STATUS_REASON_MIN_LENGTH = 5;
export const OPERATOR_STATUS_REASON_MAX_LENGTH = 255;

const STATUS_ACTION_ORDER = ["suspend", "restore", "revoke"] as const;

export type OperatorStatusAction = (typeof STATUS_ACTION_ORDER)[number];

export interface OperatorStatusActionConfig {
  readonly target: OperatorGovernanceStatus;
  readonly from: readonly OperatorStatus[];
  readonly label: string;
  readonly confirmLabel: string;
  readonly pendingLabel: string;
  readonly description: string;
  readonly successMessage: string;
  readonly variant: "secondary" | "default" | "destructive";
}

export const OPERATOR_STATUS_ACTIONS = {
  suspend: {
    target: "SUSPENDED",
    from: ["ACTIVE"],
    label: "Suspend",
    confirmLabel: "Suspend operator",
    pendingLabel: "Suspending...",
    description:
      "Ends every live control session and blocks sign-in until the operator is restored.",
    successMessage: "Operator suspended. Live sessions were revoked.",
    variant: "secondary",
  },
  restore: {
    target: "ACTIVE",
    from: ["SUSPENDED"],
    label: "Restore",
    confirmLabel: "Restore operator",
    pendingLabel: "Restoring...",
    description:
      "Returns the operator to active with the capabilities they still hold.",
    successMessage: "Operator restored.",
    variant: "default",
  },
  revoke: {
    target: "REVOKED",
    from: ["INVITED", "ACTIVE", "SUSPENDED"],
    label: "Revoke access",
    confirmLabel: "Revoke operator access",
    pendingLabel: "Revoking...",
    description:
      "Ends every live control session and revokes access permanently. The record is retained for the audit trail.",
    successMessage: "Operator access revoked.",
    variant: "destructive",
  },
} as const satisfies Record<OperatorStatusAction, OperatorStatusActionConfig>;

/** Only transitions the API accepts are offered; a terminal status offers none. */
export function availableOperatorStatusActions(
  status: OperatorStatus,
): readonly OperatorStatusAction[] {
  return STATUS_ACTION_ORDER.filter((action) => {
    const config: OperatorStatusActionConfig = OPERATOR_STATUS_ACTIONS[action];
    return config.from.includes(status);
  });
}

/** One terminality rule: an operator with no legal transition cannot be edited. */
export function canEditCapabilities(status: OperatorStatus): boolean {
  return availableOperatorStatusActions(status).length > 0;
}

/** Separation of duties: a manager changes another operator's capabilities, not their own. */
export function canEditOperatorCapabilities(
  status: OperatorStatus,
  isSelf: boolean,
): boolean {
  return !isSelf && canEditCapabilities(status);
}

export interface OperatorStatusFormValues {
  readonly reason: string;
}

export const OPERATOR_REASON_EMPTY_MESSAGE = "Enter a reason.";
export const OPERATOR_REASON_MIN_MESSAGE = `Enter at least ${OPERATOR_STATUS_REASON_MIN_LENGTH} characters.`;
export const OPERATOR_REASON_MAX_MESSAGE = `Keep the reason within ${OPERATOR_STATUS_REASON_MAX_LENGTH} characters.`;

export function operatorStatusFormFields(
  action: OperatorStatusAction,
): readonly ConfigFormField<OperatorStatusFormValues>[] {
  const config = OPERATOR_STATUS_ACTIONS[action];
  return [
    {
      name: "reason",
      label: "Reason",
      type: "textarea",
      required: true,
      colSpan: 2,
      maxLength: OPERATOR_STATUS_REASON_MAX_LENGTH,
      placeholder: "Operational reason (no tenant personal data)",
      description: `${OPERATOR_STATUS_REASON_MIN_LENGTH}-${OPERATOR_STATUS_REASON_MAX_LENGTH} characters. ${config.description} Stored with the status change and its audit row.`,
    },
  ];
}

export interface OperatorStatusFormErrors {
  readonly reason?: string;
}

export function validateOperatorStatusForm(
  values: OperatorStatusFormValues,
): OperatorStatusFormErrors {
  const reason = values.reason.trim();
  if (reason.length === 0) {
    return { reason: OPERATOR_REASON_EMPTY_MESSAGE };
  }
  if (reason.length < OPERATOR_STATUS_REASON_MIN_LENGTH) {
    return { reason: OPERATOR_REASON_MIN_MESSAGE };
  }
  if (reason.length > OPERATOR_STATUS_REASON_MAX_LENGTH) {
    return { reason: OPERATOR_REASON_MAX_MESSAGE };
  }
  return {};
}

export interface OperatorStatusBodyInput {
  readonly action: OperatorStatusAction;
  readonly values: OperatorStatusFormValues;
  readonly expectedStatus: OperatorStatus;
}

export function buildOperatorStatusBody({
  action,
  values,
  expectedStatus,
}: OperatorStatusBodyInput): {
  readonly status: OperatorGovernanceStatus;
  readonly expectedStatus: OperatorStatus;
  readonly reason: string;
} {
  return {
    status: OPERATOR_STATUS_ACTIONS[action].target,
    expectedStatus,
    reason: values.reason.trim(),
  };
}
