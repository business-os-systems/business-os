"use client";

import React from "react";
import { Button } from "@suite/ui";
import type { AutosaveStatus } from "@suite/website-builder/editor";

interface StatusView {
  readonly label: string;
  readonly tone: string;
}

const STATUS_VIEWS = {
  idle: { label: "All changes saved", tone: "text-text-muted" },
  dirty: { label: "Unsaved changes", tone: "text-warning" },
  saving: { label: "Saving...", tone: "text-text-secondary" },
  saved: { label: "All changes saved", tone: "text-success" },
  offline: { label: "Offline, retrying", tone: "text-warning" },
  conflict: { label: "Resolve the conflict", tone: "text-danger" },
  error: { label: "Save failed", tone: "text-danger" },
} as const satisfies Record<AutosaveStatus, StatusView>;

export interface AutosaveIndicatorProps {
  readonly status: AutosaveStatus;
  readonly revision: number;
  readonly error: string | null;
  readonly canSaveNow: boolean;
  readonly onSaveNow: () => void;
}

/** The explicit unsaved indicator required by FR-026. */
export function AutosaveIndicator(props: AutosaveIndicatorProps) {
  const view = STATUS_VIEWS[props.status];
  return (
    <div className="flex items-center gap-2 text-[11px]" role="status" aria-live="polite">
      <span className={"font-medium " + view.tone}>{view.label}</span>
      <span className="font-mono text-text-muted">rev {props.revision}</span>
      {props.error === null ? null : <span className="max-w-[220px] truncate text-text-muted">{props.error}</span>}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-6 px-2 text-[11px]"
        disabled={!props.canSaveNow}
        onClick={props.onSaveNow}
      >
        Save now
      </Button>
    </div>
  );
}
