"use client";

import { useState } from "react";
import { Button, Modal, Textarea } from "@suite/ui";

export interface TenantPiiReasonModalProps {
  readonly isOpen: boolean;
  readonly isSubmitting: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (reason: string) => void;
}

export function TenantPiiReasonModal({
  isOpen,
  isSubmitting,
  onCancel,
  onSubmit,
}: TenantPiiReasonModalProps) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();

  function close(): void {
    setReason("");
    onCancel();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isSubmitting) {
          close();
        }
      }}
      title="Read personal data"
      description="State why you need this tenant's member contacts. The reason is stored with the audit record."
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={isSubmitting} onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={isSubmitting || trimmed === ""}
            onClick={() => {
              onSubmit(trimmed);
              setReason("");
            }}
          >
            {isSubmitting ? "Reading..." : "Record reason and read"}
          </Button>
        </div>
      }
    >
      <label
        htmlFor="pii-reason"
        className="mb-1 block text-xs font-semibold text-text-secondary"
      >
        Reason
      </label>
      <Textarea
        id="pii-reason"
        value={reason}
        maxLength={255}
        placeholder="Support case reference and what you need to check"
        onChange={(event) => setReason(event.target.value)}
      />
    </Modal>
  );
}
