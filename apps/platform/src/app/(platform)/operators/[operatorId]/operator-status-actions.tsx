"use client";

import { useState } from "react";
import { Button } from "@suite/ui";
import type { OperatorSummary } from "@/lib/operators-api";
import { OperatorStatusModal } from "@/components/forms/operator-status-modal";
import {
  OPERATOR_STATUS_ACTIONS,
  availableOperatorStatusActions,
  type OperatorStatusAction,
} from "@/components/forms/operator-status.config";

interface OperatorStatusActionsProps {
  readonly operator: OperatorSummary;
  readonly onApplied: (operator: OperatorSummary, message: string) => void;
}

export function OperatorStatusActions({
  operator,
  onApplied,
}: OperatorStatusActionsProps) {
  const [action, setAction] = useState<OperatorStatusAction | null>(null);
  const actions = availableOperatorStatusActions(operator.status);

  if (actions.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3">
      <span className="mr-auto text-xs font-semibold text-text-secondary">
        Access actions
      </span>
      {actions.map((entry) => {
        const config = OPERATOR_STATUS_ACTIONS[entry];
        return (
          <Button
            key={entry}
            size="sm"
            variant={config.variant}
            onClick={() => setAction(entry)}
          >
            {config.label}
          </Button>
        );
      })}
      {action === null ? null : (
        <OperatorStatusModal
          operator={operator}
          action={action}
          onClose={() => setAction(null)}
          onApplied={(next) => {
            setAction(null);
            onApplied(next, OPERATOR_STATUS_ACTIONS[action].successMessage);
          }}
        />
      )}
    </section>
  );
}
