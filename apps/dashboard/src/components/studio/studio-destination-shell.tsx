import React from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@suite/ui/icons";
import { studioHomePath } from "./studio-links.config";

export interface StudioDestinationShellProps {
  readonly siteId: string;
  readonly title: string;
  readonly description: string;
  readonly children: React.ReactNode;
}

/**
 * Shared chrome for a site-level studio destination: the back link keeps the
 * editor one click away, so a tenant never returns to a list screen to resume
 * editing (FR-082).
 */
export function StudioDestinationShell(props: StudioDestinationShellProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-text">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <Link
          href={studioHomePath(props.siteId)}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <ArrowLeftIcon size={14} />
          Back to studio
        </Link>
        <span className="h-4 w-px bg-border" />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-text">{props.title}</h1>
          <p className="truncate text-[11px] text-text-secondary">{props.description}</p>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">{props.children}</main>
    </div>
  );
}
