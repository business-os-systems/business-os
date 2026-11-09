"use client";

import React from "react";
import { firstNonEmpty } from "@/components/auth/shared/first-non-empty";
import type { InvitationDetails } from "@/lib/invitation-client";

const ALL_BRANCHES_LABEL = "All Branches";

interface ContextCellProps {
  label: string;
  value: string;
  monospace?: boolean;
}

function ContextCell({ label, value, monospace = false }: ContextCellProps) {
  const valueClass = monospace
    ? "font-mono text-[11px] text-text font-medium truncate block"
    : "font-medium text-text truncate block";
  return (
    <div className="min-w-0">
      <span className="text-[10px] uppercase font-semibold text-text-muted tracking-wider block">
        {label}
      </span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

export interface InvitationContextStripProps {
  details: InvitationDetails;
}

/** Horizontal workspace context strip (four columns on wide viewports). */
export function InvitationContextStrip({ details }: InvitationContextStripProps) {
  return (
    <div className="p-3 bg-surface-muted border border-border rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
      <ContextCell label="Workspace" value={details.organizationName} />
      <ContextCell label="Role" value={details.roleName} />
      <ContextCell
        label="Branch Scope"
        value={firstNonEmpty(details.branchName, ALL_BRANCHES_LABEL) ?? ALL_BRANCHES_LABEL}
      />
      <ContextCell label="Invited Email" value={details.email} monospace />
    </div>
  );
}
