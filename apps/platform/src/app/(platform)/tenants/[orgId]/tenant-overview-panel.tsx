"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@suite/ui";
import { formatDateTime } from "@/lib/format";
import type { TenantRecord } from "@/lib/tenant-api";
import { definitionRowClass } from "./tenant-record-shared";

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
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-xs text-text-muted">
            Source: platform overview view, as of{" "}
            {formatDateTime(new Date().toISOString())}.
          </p>
          <dl>
            <DefinitionRow label="Name" value={record.profile.name} />
            <DefinitionRow label="Slug" value={record.profile.slug} />
            <DefinitionRow
              label="Tenant id"
              value={<span className="font-mono">{record.profile.id}</span>}
            />
            <DefinitionRow label="Status" value={record.profile.status} />
            <DefinitionRow
              label="Created"
              value={formatDateTime(record.profile.createdAt)}
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
