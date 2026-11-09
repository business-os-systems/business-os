"use client";

import { useState } from "react";
import { Button } from "@suite/ui";
import { downloadAuditCsv, type AuditFilters } from "@/lib/audit-api";
import { toMessage } from "@/lib/error-message";
import { AuditExportModal } from "./audit-export-modal";

export const AUDIT_EXPORT_DENIED_REASON =
  "Export requires the Read personal data capability.";

interface AuditExportActionProps {
  readonly filters: AuditFilters;
  readonly canReadPii: boolean;
}

function DeniedExportAction() {
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        disabled
        title={AUDIT_EXPORT_DENIED_REASON}
        aria-describedby="audit-export-denied-reason"
      >
        Export CSV
      </Button>
      <p
        id="audit-export-denied-reason"
        className="max-w-xs text-right text-xs text-text-muted"
      >
        {AUDIT_EXPORT_DENIED_REASON}
      </p>
    </div>
  );
}

/**
 * The export is a separate PII-gated action: the reason is collected first and
 * the CSV is requested only with a valid reason. Without the capability the
 * control stays visible, disabled and explained rather than hidden.
 */
export function AuditExportAction({
  filters,
  canReadPii,
}: AuditExportActionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download(reason: string): Promise<void> {
    setIsDownloading(true);
    setError(null);
    try {
      await downloadAuditCsv({ filters, reason });
      setIsOpen(false);
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setIsDownloading(false);
    }
  }

  if (!canReadPii) {
    return <DeniedExportAction />;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" onClick={() => setIsOpen(true)}>
        Export CSV
      </Button>
      <p className="max-w-xs text-right text-xs text-text-muted">
        CSV of the filtered rows, with a recorded reason.
      </p>
      {isOpen ? (
        <AuditExportModal
          isSubmitting={isDownloading}
          error={error}
          onClose={() => {
            setIsOpen(false);
            setError(null);
          }}
          onSubmit={(reason) => void download(reason)}
        />
      ) : null}
    </div>
  );
}
