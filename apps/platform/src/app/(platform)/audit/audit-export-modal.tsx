"use client";

import { useId } from "react";
import { Alert, Button, Modal } from "@suite/ui";
import { ConfigFormRenderer } from "@/components/forms/config-form-renderer";
import { useConfigForm } from "@/components/forms/use-config-form";
import {
  AUDIT_EXPORT_FORM_FIELDS,
  EMPTY_AUDIT_EXPORT_FORM,
  validateAuditExportForm,
  type AuditExportFormValues,
} from "./audit-export-form.config";

interface ExportModalFooterProps {
  readonly formId: string;
  readonly isSubmitting: boolean;
  readonly onClose: () => void;
}

function ExportModalFooter({
  formId,
  isSubmitting,
  onClose,
}: ExportModalFooterProps) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" disabled={isSubmitting} onClick={onClose}>
        Cancel
      </Button>
      <Button
        type="submit"
        form={formId}
        isLoading={isSubmitting}
        disabled={isSubmitting}
      >
        {isSubmitting ? "Exporting..." : "Export CSV"}
      </Button>
    </div>
  );
}

export interface AuditExportModalProps {
  readonly isSubmitting: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (reason: string) => void;
}

export function AuditExportModal({
  isSubmitting,
  error,
  onClose,
  onSubmit,
}: AuditExportModalProps) {
  const formId = useId();
  const form = useConfigForm<AuditExportFormValues>({
    initialValues: EMPTY_AUDIT_EXPORT_FORM,
  });

  function submit(): void {
    const nextErrors = validateAuditExportForm(form.values);
    form.setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    onSubmit(form.values.reason.trim());
  }

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!isSubmitting) {
          onClose();
        }
      }}
      title="Export audit CSV"
      description="The CSV includes the redacted before/after payloads. State why you need the export; the reason is stored in the audit trail."
      size="lg"
      footer={
        <ExportModalFooter
          formId={formId}
          isSubmitting={isSubmitting}
          onClose={onClose}
        />
      }
    >
      <form
        id={formId}
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {error === null ? null : <Alert variant="error" message={error} />}
        <ConfigFormRenderer
          fields={AUDIT_EXPORT_FORM_FIELDS}
          values={form.values}
          errors={form.errors}
          disabled={isSubmitting}
          formId={formId}
          onChange={form.updateField}
        />
      </form>
    </Modal>
  );
}
