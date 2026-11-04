"use client";

import { Button, type TableEmptyStateConfig } from "@suite/ui";

export function ConfigTableEmptyState({
  emptyState,
}: {
  readonly emptyState: TableEmptyStateConfig;
}) {
  const hasAction =
    emptyState.actionLabel !== undefined && emptyState.onAction !== undefined;

  return (
    <div className="rounded-lg border border-border bg-surface p-10 text-center">
      <p className="text-sm font-semibold text-text">{emptyState.title}</p>
      <p className="mt-1 text-sm text-text-secondary">
        {emptyState.description}
      </p>
      {hasAction ? (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={emptyState.onAction}>
            {emptyState.actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
