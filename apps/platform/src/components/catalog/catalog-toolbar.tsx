"use client";

import { Button, Select } from "@suite/ui";
import {
  CATALOG_ITEM_STATUSES,
  CATALOG_STATUS_LABELS,
  type CatalogItemStatus,
} from "@/lib/catalog-api";
import {
  CATALOG_STATUS_ALL,
  isCatalogStatusFilter,
  type CatalogStatusFilter,
} from "./use-catalog-items";

const STATUS_OPTIONS = [
  { label: "All statuses", value: CATALOG_STATUS_ALL },
  ...CATALOG_ITEM_STATUSES.map((status: CatalogItemStatus) => ({
    label: CATALOG_STATUS_LABELS[status],
    value: status,
  })),
];

interface CatalogToolbarProps {
  readonly status: CatalogStatusFilter;
  readonly total: number;
  readonly isBusy: boolean;
  readonly createLabel: string;
  readonly canCreate: boolean;
  readonly onChange: (status: CatalogStatusFilter) => void;
  readonly onCreate: () => void;
}

export function CatalogToolbar({
  status,
  total,
  isBusy,
  createLabel,
  canCreate,
  onChange,
  onCreate,
}: CatalogToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-48">
          <label htmlFor="catalog-status-filter" className="sr-only">
            Filter by status
          </label>
          <Select
            id="catalog-status-filter"
            value={status}
            options={STATUS_OPTIONS}
            disabled={isBusy}
            onChange={(value) => {
              if (isCatalogStatusFilter(value)) {
                onChange(value);
              }
            }}
          />
        </div>
        <span className="text-xs text-text-secondary">
          Showing {total} {total === 1 ? "item" : "items"}
        </span>
      </div>
      {canCreate ? <Button onClick={onCreate}>{createLabel}</Button> : null}
    </div>
  );
}
