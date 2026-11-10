"use client";

import { useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, Checkbox } from "@suite/ui";
import { formatDateTime, formatDateTimeInZone } from "@/lib/format";
import type { TenantRecord } from "@/lib/tenant-api";
import { definitionRowClass } from "./tenant-record-shared";

const UTC_LABEL = "Times shown in UTC.";
const LOCAL_LABEL_PREFIX = "Times shown in the tenant zone";

function DefinitionRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={definitionRowClass}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="text-sm text-text">{value}</dd>
    </div>
  );
}

export function TenantOverviewPanel({
  record,
  personalDataSlot,
}: {
  readonly record: TenantRecord;
  readonly personalDataSlot?: ReactNode;
}) {
  const [showLocalTime, setShowLocalTime] = useState(false);
  const timezone = record.profile.timezone;
  const formatTimestamp = showLocalTime
    ? (value: string) => formatDateTimeInZone(value, timezone)
    : formatDateTime;
  const timeZoneLabel = showLocalTime
    ? `${LOCAL_LABEL_PREFIX} (${timezone}).`
    : UTC_LABEL;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Overview</CardTitle>
          <Checkbox
            label={`Show tenant local time (${timezone})`}
            checked={showLocalTime}
            onChange={(event) => setShowLocalTime(event.target.checked)}
          />
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-xs text-text-muted">
            Source: platform overview view, as of{" "}
            {formatTimestamp(record.counts.asOf)}. {timeZoneLabel}
          </p>
          <dl>
            <DefinitionRow label="Name" value={record.profile.name} />
            <DefinitionRow label="Slug" value={record.profile.slug} />
            <DefinitionRow
              label="Tenant id"
              value={<span className="font-mono">{record.profile.id}</span>}
            />
            <DefinitionRow label="Status" value={record.profile.status} />
            <DefinitionRow label="Time zone" value={timezone} />
            <DefinitionRow
              label="Created"
              value={formatTimestamp(record.profile.createdAt)}
            />
            <DefinitionRow
              label="Branches"
              value={String(record.counts.branches)}
            />
            <DefinitionRow
              label="Members"
              value={String(record.counts.members)}
            />
          </dl>
        </CardContent>
      </Card>
      {personalDataSlot}
    </div>
  );
}
