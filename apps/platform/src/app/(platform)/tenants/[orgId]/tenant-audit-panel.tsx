"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@suite/ui";
import { formatDateTime } from "@/lib/format";
import type { TenantAuditEntry, TenantLifecycleEntry } from "@/lib/tenant-api";

function LifecycleList({
  entries,
  canReadReason,
}: {
  readonly entries: readonly TenantLifecycleEntry[];
  readonly canReadReason: boolean;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        No lifecycle change has been recorded for this tenant.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="border-b border-border pb-2 last:border-b-0"
        >
          <p className="text-sm text-text">
            {entry.fromStatus} to {entry.toStatus}
          </p>
          <p className="text-xs text-text-muted">
            {formatDateTime(entry.occurredAt)} -{" "}
            {canReadReason ? entry.reason : "Reason withheld"}
          </p>
        </li>
      ))}
    </ul>
  );
}

function AuditList({
  entries,
}: {
  readonly entries: readonly TenantAuditEntry[];
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        No platform action has been recorded for this tenant.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="border-b border-border pb-2 last:border-b-0"
        >
          <p className="text-sm text-text">{entry.action}</p>
          <p className="text-xs text-text-muted">
            {formatDateTime(entry.occurredAt)} - {entry.entityType}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function TenantAuditPanel({
  lifecycle,
  audit,
  lifecycleHasMore,
  canReadReason,
}: {
  readonly lifecycle: readonly TenantLifecycleEntry[];
  readonly audit: readonly TenantAuditEntry[];
  readonly lifecycleHasMore: boolean;
  readonly canReadReason: boolean;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lifecycle</CardTitle>
        </CardHeader>
        <CardContent>
          <LifecycleList entries={lifecycle} canReadReason={canReadReason} />
          {lifecycleHasMore ? (
            <p className="mt-2 text-xs text-text-muted">
              Showing the most recent 20 events.
            </p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent platform audit</CardTitle>
        </CardHeader>
        <CardContent>
          <AuditList entries={audit} />
        </CardContent>
      </Card>
    </div>
  );
}
