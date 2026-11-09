"use client";

import React from "react";
import Link from "next/link";

/** Footer navigation for the workspace chooser envelope card. */
export function ChooseTenantCardFooter() {
  return (
    <div className="flex flex-col items-center gap-1.5 text-xs text-text-muted">
      <span>Logged into the wrong account?</span>
      <Link
        href="/login"
        className="text-action hover:text-action-hover font-semibold underline-offset-2 hover:underline"
      >
        Sign in with another email
      </Link>
    </div>
  );
}
