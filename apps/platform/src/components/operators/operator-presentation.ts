import type { OperatorStatus } from "@/lib/operators-api";

/**
 * One human-readable status registry for the operator screens. The stored value
 * stays canonical; only the label and the semantic text colour change.
 */
export const OPERATOR_STATUS_PRESENTATION: Record<
  OperatorStatus,
  { readonly label: string; readonly className: string }
> = {
  INVITED: { label: "Invited", className: "text-brand" },
  ACTIVE: { label: "Active", className: "text-success" },
  SUSPENDED: { label: "Suspended", className: "text-warning" },
  REVOKED: { label: "Revoked", className: "text-danger" },
};

const OPERATOR_SIGN_IN_PRESENTATION = {
  enrolled: { label: "Passkey", className: "font-semibold text-success" },
  missing: { label: "Not enrolled", className: "text-text-muted" },
} as const;

export function operatorSignIn(mfaEnrolled: boolean) {
  return OPERATOR_SIGN_IN_PRESENTATION[mfaEnrolled ? "enrolled" : "missing"];
}
