"use client";

import React from "react";

const SKELETON_ROWS = [1, 2] as const;

/** Loading placeholder rows shown while the workspace list resolves. */
export function ChooseTenantSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 py-4">
      {SKELETON_ROWS.map((row) => (
        <div
          key={row}
          className="h-16 rounded-xl bg-surface-muted border border-border animate-pulse"
        />
      ))}
    </div>
  );
}
