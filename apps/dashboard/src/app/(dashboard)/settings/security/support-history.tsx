"use client";

import React from "react";
import Link from "next/link";
import { Card } from "@suite/ui";
import { ConfigTableRenderer } from "@/components/config-renderers/config-table-renderer";
import type { SupportSessionHistoryItem } from "@/lib/support-session-client";
import {
  createSupportHistoryTableConfig,
  SUPPORT_HISTORY_COPY,
  SUPPORT_HISTORY_PATH,
} from "./support-history.config";

export interface SupportHistoryProps {
  readonly items: SupportSessionHistoryItem[];
  /** The API cursor for the next page, or null at the end of the history. */
  readonly nextCursor: string | null;
  /** True when the reader is on an older page and can return to the newest. */
  readonly showNewest: boolean;
}

function buildOlderPageHref(cursor: string): string {
  return `${SUPPORT_HISTORY_PATH}?cursor=${encodeURIComponent(cursor)}`;
}

/**
 * Tenant-visible, read-only support-session history (FR-049, CT-5). The table
 * is declared in support-history.config.tsx; this component composes it and
 * exposes the API cursor as a link so older sessions stay reachable.
 */
export function SupportHistory({
  items,
  nextCursor,
  showNewest,
}: SupportHistoryProps) {
  const config = createSupportHistoryTableConfig();

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden border border-border bg-surface p-0 shadow-2xs">
        <ConfigTableRenderer
          config={config}
          data={items}
          className="w-full overflow-auto border-0 rounded-none shadow-none"
        />
      </Card>
      {nextCursor === null && !showNewest ? null : (
        <nav
          aria-label={SUPPORT_HISTORY_COPY.paginationLabel}
          className="flex items-center justify-end gap-4 text-xs font-medium"
        >
          {showNewest ? (
            <Link
              href={SUPPORT_HISTORY_PATH}
              prefetch={false}
              className="text-text-secondary hover:text-text"
            >
              {SUPPORT_HISTORY_COPY.newestSessions}
            </Link>
          ) : null}
          {nextCursor === null ? null : (
            <Link
              href={buildOlderPageHref(nextCursor)}
              prefetch={false}
              className="text-action hover:text-action-hover"
            >
              {SUPPORT_HISTORY_COPY.olderSessions}
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
