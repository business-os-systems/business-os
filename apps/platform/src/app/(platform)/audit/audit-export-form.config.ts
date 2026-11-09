import type {
  ConfigFormErrors,
  ConfigFormField,
} from "@/components/forms/config-form.types";
import {
  MAXIMUM_AUDIT_REASON_LENGTH,
  MINIMUM_AUDIT_REASON_LENGTH,
  auditReasonSchema,
} from "@/lib/audit-api";

/** Declarative reason form for the PII-gated audit CSV export. */

export interface AuditExportFormValues {
  readonly reason: string;
}

export const EMPTY_AUDIT_EXPORT_FORM: AuditExportFormValues = { reason: "" };

export const AUDIT_EXPORT_FORM_FIELDS: readonly ConfigFormField<AuditExportFormValues>[] =
  [
    {
      name: "reason",
      type: "textarea",
      label: "Reason",
      required: true,
      rows: 3,
      maxLength: MAXIMUM_AUDIT_REASON_LENGTH,
      colSpan: 2,
      placeholder: "Support case reference and what you need to export",
      description: `Stored with the export audit record. Between ${MINIMUM_AUDIT_REASON_LENGTH} and ${MAXIMUM_AUDIT_REASON_LENGTH} characters.`,
    },
  ];

export function validateAuditExportForm(
  values: AuditExportFormValues,
): ConfigFormErrors<AuditExportFormValues> {
  const parsed = auditReasonSchema.safeParse(values.reason);
  if (parsed.success) {
    return {};
  }
  return {
    reason: parsed.error.issues[0]?.message ?? "Provide an export reason.",
  };
}
