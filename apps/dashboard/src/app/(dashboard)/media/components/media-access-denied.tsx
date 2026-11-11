import React from "react";
import Link from "next/link";
import { PERMISSIONS } from "@suite/core";

/** Fail-closed workspace denial: the page never mounts the library. */
export function MediaAccessDenied() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center justify-center rounded-xl border border-border bg-surface p-8 text-center">
      <h1 className="text-lg font-bold text-text">Media access denied</h1>
      <p className="mt-2 text-sm text-text-secondary">
        Your role does not include the {PERMISSIONS.MEDIA.READ} capability. Ask
        a workspace administrator to grant it before opening the shared library.
      </p>
      <Link
        href="/dashboard"
        prefetch={false}
        className="mt-4 rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text hover:bg-surface-muted"
      >
        Back to overview
      </Link>
    </div>
  );
}
