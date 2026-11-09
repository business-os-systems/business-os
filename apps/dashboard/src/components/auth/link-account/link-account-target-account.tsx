"use client";

import React from "react";

export interface LinkAccountTargetAccountProps {
  email: string;
}

/** Read-only summary of the existing account the OAuth identity will link to. */
export function LinkAccountTargetAccount({ email }: LinkAccountTargetAccountProps) {
  return (
    <div className="p-2.5 rounded-lg bg-surface-subtle border border-border text-xs flex flex-col gap-1">
      <span className="text-[10px] uppercase font-semibold text-text-muted">
        Target Account
      </span>
      <span className="font-medium text-text">{email}</span>
    </div>
  );
}
