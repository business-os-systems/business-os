"use client";

import { useId } from "react";
import { Button, Modal } from "@suite/ui";
import {
  QUOTA_UPDATE_FORM_FIELDS,
  quotaCreateFormFields,
} from "@/components/quotas/quotas.config";
import { quotaResourceLabel, type QuotaItem } from "@/lib/quotas-api";
import { QuotaEditorForm } from "./quota-editor-form";
import { useQuotaForm } from "./use-quota-form";

interface QuotaEditorModalProps {
  readonly orgId: string;
  readonly quota: QuotaItem | null;
  readonly availableResources: readonly string[];
  readonly onClose: () => void;
  readonly onSaved: (items: readonly QuotaItem[]) => void;
}

export function QuotaEditorModal({
  orgId,
  quota,
  availableResources,
  onClose,
  onSaved,
}: QuotaEditorModalProps) {
  const formId = useId();
  const form = useQuotaForm(orgId, quota, availableResources, onSaved);
  const fields =
    quota === null
      ? quotaCreateFormFields(availableResources)
      : QUOTA_UPDATE_FORM_FIELDS;
  const title =
    quota === null
      ? "Add a quota"
      : `Edit quota — ${quotaResourceLabel(quota.resourceKey)}`;

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!form.mutation.isSaving) onClose();
      }}
      title={title}
      description={
        quota === null
          ? "A new limit starts with no observed version. The API writes the audit row in the same transaction."
          : `Current usage: ${quota.currentValue ?? "not measured"}. The version observed when this row loaded is sent with the change.`
      }
      size="lg"
      contentClassName="overflow-visible"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            disabled={form.mutation.isSaving}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            isLoading={form.mutation.isSaving}
            disabled={form.mutation.isSaving}
          >
            {quota === null ? "Add quota" : "Save limit"}
          </Button>
        </div>
      }
    >
      <QuotaEditorForm formId={formId} form={form} fields={fields} />
    </Modal>
  );
}
