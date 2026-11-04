"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@suite/ui";
import { toMessage } from "@/lib/error-message";
import { formatDateTime } from "@/lib/format";
import { fetchTenantPii, type TenantPii } from "@/lib/tenant-api";
import { TenantPiiMemberTable } from "./tenant-pii-member-table";
import { TenantPiiReasonModal } from "./tenant-pii-reason-modal";

export interface TenantPiiPanelProps {
  readonly orgId: string;
  readonly canRead: boolean;
}

/**
 * Personal data is never shown by default: the operator records a reason, the
 * database audits the read, and the result is cleared when the operator hides
 * it or leaves the tenant.
 */
export function TenantPiiPanel({ orgId, canRead }: TenantPiiPanelProps) {
  const [isReasonOpen, setIsReasonOpen] = useState(false);
  const [result, setResult] = useState<TenantPii | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canRead) {
    return null;
  }

  async function load(reason: string): Promise<void> {
    setIsLoading(true);
    setError(null);
    try {
      setResult(await fetchTenantPii(orgId, reason));
      setIsReasonOpen(false);
    } catch (cause) {
      // A failed re-read must not leave the previous members on screen as if
      // they were current.
      setResult(null);
      setError(toMessage(cause));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Personal data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-text-secondary">
          Member names and email addresses. Each read requires a recorded reason
          and is written to the platform audit trail.
        </p>

        {error !== null ? (
          <Alert
            variant="error"
            title="Could not read personal data"
            message={error}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => setIsReasonOpen(true)}>
            {result === null ? "Show personal data" : "Read again"}
          </Button>
          {result === null ? null : (
            <>
              <Button variant="ghost" onClick={() => setResult(null)}>
                Hide
              </Button>
              <span className="text-xs text-text-muted">
                Source: platform personal-data read, as of{" "}
                {formatDateTime(result.checkedAt)}
              </span>
            </>
          )}
        </div>

        {result === null ? null : (
          <TenantPiiMemberTable members={result.members} />
        )}
      </CardContent>

      <TenantPiiReasonModal
        isOpen={isReasonOpen}
        isSubmitting={isLoading}
        onCancel={() => setIsReasonOpen(false)}
        onSubmit={(reason) => void load(reason)}
      />
    </Card>
  );
}
