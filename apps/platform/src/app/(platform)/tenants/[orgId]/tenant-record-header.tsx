"use client";

import { Badge, Button } from "@suite/ui";
import { ArrowLeftIcon } from "@suite/ui/icons";
import type { TenantRecord } from "@/lib/tenant-api";

export function TenantRecordHeader({
  record,
  onBack,
}: {
  readonly record: TenantRecord;
  readonly onBack: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <Button
          variant="ghost"
          size="sm"
          startIcon={<ArrowLeftIcon className="h-4 w-4" />}
          onClick={onBack}
        >
          Back to tenants
        </Button>
        <h1 className="mt-1 text-2xl font-semibold">{record.profile.name}</h1>
        <p className="mt-1 text-sm text-text-secondary">{record.profile.slug}</p>
        <p className="text-xs text-text-muted">{record.profile.id}</p>
      </div>
      <Badge variant="tertiary">{record.profile.status}</Badge>
    </div>
  );
}
