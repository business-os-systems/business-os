"use client";

import { ConfigTable, resolveConfigTableState } from "@/components/tables/config-table";
import {
  CATALOG_ACTIVITY_TABLE_CONFIG,
  buildCatalogActivity,
} from "./catalog-activity.config";
import { useCatalogSnapshot } from "./use-catalog-snapshot";

interface CatalogActivityPanelProps {
  readonly appId: string;
}

/** The record's Activity destination over the catalog's stored timestamps. */
export function CatalogActivityPanel({ appId }: CatalogActivityPanelProps) {
  const snapshot = useCatalogSnapshot({ appId, enabled: true });
  const entries = buildCatalogActivity(snapshot.items);
  const state = resolveConfigTableState({
    isLoading: snapshot.isLoading,
    error: snapshot.error,
    rowCount: entries.length,
    errorTitle: "Unable to load catalog activity",
  });

  return (
    <div className="max-w-full space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Catalog creation, drafts, previews and publishes for this application, newest
          first.
        </p>
      </div>
      <ConfigTable
        config={CATALOG_ACTIVITY_TABLE_CONFIG}
        rows={entries}
        state={state}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.itemName + " " + row.action}
      />
    </div>
  );
}
