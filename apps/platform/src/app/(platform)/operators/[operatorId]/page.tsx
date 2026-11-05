"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, Button, Spinner } from "@suite/ui";
import { ArrowLeftIcon } from "@suite/ui/icons";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import { OperatorCapabilityDenied } from "@/components/operators/operator-denied";
import { toMessage } from "@/lib/error-message";
import {
  canManageOperators,
  findOperatorById,
  type OperatorSummary,
} from "@/lib/operators-api";
import { canEditOperatorCapabilities } from "@/components/forms/operator-status.config";
import { OperatorRecordHeader } from "./operator-record-header";
import { OperatorStatusActions } from "./operator-status-actions";
import { OperatorCapabilitiesPanel } from "./operator-capabilities-panel";
import { OperatorSessionsPanel } from "./operator-sessions-panel";

function useOperatorRecord(operatorId: string, enabled: boolean) {
  const [operator, setOperator] = useState<OperatorSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    setOperator(null);
    try {
      setOperator(await findOperatorById(operatorId, signal));
    } catch (cause) {
      if (signal?.aborted === true) {
        return;
      }
      setError(toMessage(cause));
    } finally {
      if (signal?.aborted !== true) {
        setIsLoading(false);
      }
    }
  }, [operatorId]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [enabled, load]);

  return { operator, setOperator, isLoading, error, load };
}

interface OperatorLoadFailureProps {
  readonly error: string | null;
  readonly onRetry: () => void;
  readonly onBack: () => void;
}

function OperatorLoadFailure({
  error,
  onRetry,
  onBack,
}: OperatorLoadFailureProps) {
  return (
    <div className="max-w-3xl space-y-4">
      <Alert
        variant="error"
        title="Unable to load this operator"
        message={error ?? "The operator could not be read."}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
        <Button
          variant="secondary"
          startIcon={<ArrowLeftIcon className="h-4 w-4" />}
          onClick={onBack}
        >
          Back to operators
        </Button>
      </div>
    </div>
  );
}

interface OperatorRecordViewProps {
  readonly operator: OperatorSummary;
  readonly isSelf: boolean;
  readonly notice: string | null;
  readonly onDismissNotice: () => void;
  readonly onApplied: (operator: OperatorSummary, message: string) => void;
  readonly onBack: () => void;
}

function OperatorRecordView({
  operator,
  isSelf,
  notice,
  onDismissNotice,
  onApplied,
  onBack,
}: OperatorRecordViewProps) {
  const canEdit = canEditOperatorCapabilities(operator.status, isSelf);
  return (
    <div className="max-w-4xl space-y-4">
      <OperatorRecordHeader operator={operator} onBack={onBack} />
      {notice === null ? null : (
        <Alert
          variant="success"
          message={notice}
          dismissible
          onDismiss={onDismissNotice}
        />
      )}
      <OperatorStatusActions operator={operator} onApplied={onApplied} />
      {canEdit ? (
        <OperatorCapabilitiesPanel
          key={operator.id}
          operator={operator}
          onApplied={onApplied}
        />
      ) : (
        <p className="rounded-lg border border-border bg-surface p-3 text-xs text-text-muted">
          {isSelf
            ? "Your own capabilities are changed by another operator."
            : "This operator is revoked. Access and capabilities are terminal."}
        </p>
      )}
      <OperatorSessionsPanel
        key={`${operator.id}-${operator.status}`}
        operatorId={operator.id}
      />
    </div>
  );
}

export default function OperatorRecordPage() {
  const params = useParams<{ operatorId: string }>();
  const operatorId = params.operatorId;
  const router = useRouter();
  const { session } = usePlatformAuth();
  const allowed = canManageOperators(session?.capabilities);
  const isSelf = session?.operator.id === operatorId;
  const record = useOperatorRecord(operatorId, allowed);
  const [notice, setNotice] = useState<string | null>(null);

  function applyOperator(next: OperatorSummary, message: string): void {
    record.setOperator(next);
    setNotice(message);
  }

  if (!allowed) {
    return <OperatorCapabilityDenied />;
  }

  if (record.isLoading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (record.operator === null) {
    return (
      <OperatorLoadFailure
        error={record.error}
        onRetry={() => void record.load()}
        onBack={() => router.push("/operators")}
      />
    );
  }

  return (
    <OperatorRecordView
      operator={record.operator}
      isSelf={isSelf}
      notice={notice}
      onDismissNotice={() => setNotice(null)}
      onApplied={applyOperator}
      onBack={() => router.push("/operators")}
    />
  );
}
