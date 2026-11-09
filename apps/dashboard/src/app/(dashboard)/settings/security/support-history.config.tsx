import React from "react";
import { SUPPORT_SESSION_TENANT_ACTOR_PREFIX } from "@suite/core";
import type { TableColumnConfig, TableConfig } from "@suite/ui";
import type { SupportSessionHistoryItem } from "@/lib/support-session-client";
import { EndSupportSessionButton } from "./end-support-session-button";

/** One API page per request; older pages are reached through the returned cursor (CT-5). */
export const SUPPORT_HISTORY_PAGE_SIZE = 20;

/** Page and pagination copy, so neither the page nor the table hardcodes strings. */
/** The tenant security surface that owns the support-session history. */
export const SUPPORT_HISTORY_PATH = "/settings/security";

export const SUPPORT_HISTORY_COPY = {
  pageTitle: "Security",
  pageDescription:
    "Review every read-only support session that touched this workspace.",
  loadErrorTitle: "Could not load support-session history",
  transportFailureDetail: "The support-session history could not be read.",
  paginationLabel: "Support-session history pages",
  olderSessions: "Older sessions",
  newestSessions: "Newest sessions",
} as const;

export type SupportHistoryState = "active" | "expired" | "ended";

interface SupportHistoryPresentation {
  readonly label: string;
  readonly className: string;
}

/**
 * One canonical state-to-presentation map. The label is always rendered; the
 * semantic text colour is an additional signal, never the only one.
 */
const SUPPORT_HISTORY_PRESENTATION = {
  active: { label: "Active", className: "text-success" },
  expired: { label: "Expired", className: "text-text-muted" },
  ended: { label: "Ended", className: "text-text-secondary" },
} as const satisfies Record<SupportHistoryState, SupportHistoryPresentation>;

export function deriveSupportHistoryState(
  item: SupportSessionHistoryItem,
  now: number = Date.now()
): SupportHistoryState {
  if (item.endedAt !== null) {
    return "ended";
  }
  if (new Date(item.expiresAt).getTime() <= now) {
    return "expired";
  }
  return "active";
}

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export function formatSupportHistoryTimestamp(value: string | null): string {
  if (value === null) {
    return "—";
  }
  return `${TIMESTAMP_FORMATTER.format(new Date(value))} UTC`;
}

/**
 * A support session can be ended by the operator or by a tenant administrator.
 * The stored actor is an id, so the table names the actor kind instead of
 * printing a raw identifier (FR-049).
 */
export function formatSupportSessionActor(endedBy: string | null): string {
  if (endedBy === null) {
    return "—";
  }
  if (endedBy.startsWith(SUPPORT_SESSION_TENANT_ACTOR_PREFIX)) {
    return "Tenant administrator";
  }
  return "Platform operator";
}

function renderStatus(item: SupportSessionHistoryItem): React.ReactNode {
  const state = deriveSupportHistoryState(item);
  const presentation = SUPPORT_HISTORY_PRESENTATION[state];
  return (
    <span className={`font-medium ${presentation.className}`}>
      {presentation.label}
    </span>
  );
}

function identityColumns(): TableColumnConfig<SupportSessionHistoryItem>[] {
  return [
    {
      key: "operatorDisplayName",
      header: "Operator",
      sortable: true,
      render: (_value, row) => (
        <span className="font-medium text-text">{row.operatorDisplayName}</span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      render: (value) => (
        <span className="text-text-secondary">{String(value)}</span>
      ),
    },
    {
      key: "ticketRef",
      header: "Ticket",
      render: (value) => (
        <span className="font-mono text-[11px] text-text-secondary">
          {String(value)}
        </span>
      ),
    },
  ];
}

function lifecycleColumns(
  canEnd: boolean,
): TableColumnConfig<SupportSessionHistoryItem>[] {
  return [
    {
      key: "startedAt",
      header: "Started",
      sortable: true,
      render: (value) => (
        <span className="text-text-secondary">
          {formatSupportHistoryTimestamp(String(value))}
        </span>
      ),
    },
    {
      key: "expiresAt",
      header: "Expires",
      render: (value) => (
        <span className="text-text-secondary">
          {formatSupportHistoryTimestamp(String(value))}
        </span>
      ),
    },
    {
      key: "endedBy",
      header: "Ended by",
      render: (_value, row) => (
        <span className="text-text-secondary">
          {formatSupportSessionActor(row.endedBy)}
        </span>
      ),
    },
    {
      key: "endedAt",
      header: "Status",
      render: (_value, row) => (
        <span className="flex items-center justify-end gap-2">
          {renderStatus(row)}
          {canEnd && deriveSupportHistoryState(row) === "active" ? (
            <EndSupportSessionButton ticketId={row.ticketId} />
          ) : null}
        </span>
      ),
    },
  ];
}

export interface SupportHistoryTableOptions {
  readonly canEnd: boolean;
}

export function createSupportHistoryTableConfig({
  canEnd,
}: SupportHistoryTableOptions): TableConfig<SupportSessionHistoryItem> {
  return {
    id: "support-session-history-table",
    columns: [...identityColumns(), ...lifecycleColumns(canEnd)],
    emptyState: {
      title: "No support sessions recorded",
      description:
        "No platform operator has opened a support session for this workspace.",
    },
  };
}
