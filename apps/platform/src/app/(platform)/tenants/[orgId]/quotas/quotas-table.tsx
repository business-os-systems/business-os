"use client";

import { PlatformViewState } from "@/components/states/view-state";
import { ConfigTable } from "@/components/tables/config-table";
import { QUOTA_TABLE_CONFIG } from "@/components/quotas/quotas.config";
import type { QuotaItem } from "@/lib/quotas-api";
import type { QuotaEditorState } from "./use-quotas";

export function QuotasTable({
  items,
  onOpen,
}: {
  readonly items: readonly QuotaItem[];
  readonly onOpen: (editor: QuotaEditorState) => void;
}) {
  if (items.length === 0) {
    return (
      <PlatformViewState
        state={{
          kind: "empty",
          title: "No quotas configured",
          description:
            "This tenant has no limit configured. Add a quota to set a measured limit for a resource.",
          actionLabel: "Add quota",
          onAction: () => onOpen({ mode: "create" }),
        }}
      />
    );
  }
  return (
    <ConfigTable
      config={QUOTA_TABLE_CONFIG}
      rows={items}
      state={{ kind: "ready" }}
      rowKey={(row) => row.resourceKey}
      rowLabel={(row) => row.resourceKey}
      onRowClick={(row) => onOpen({ mode: "edit", quota: row })}
    />
  );
}
