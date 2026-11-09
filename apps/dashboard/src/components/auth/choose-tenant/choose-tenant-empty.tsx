"use client";

import React from "react";
import Link from "next/link";

const CREATE_WORKSPACE_HREF = "/onboarding/step-1";

/** Genuine empty state for an account with no active workspace membership. */
export function ChooseTenantEmpty() {
  return (
    <div className="py-8 text-center text-xs text-text-muted flex flex-col items-center gap-3">
      <p>No active workspaces found for this account.</p>
      <Link
        href={CREATE_WORKSPACE_HREF}
        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-action text-on-action hover:bg-action-hover transition-colors"
      >
        Create New Workspace
      </Link>
    </div>
  );
}
