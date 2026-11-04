"use client";

import { Input, Select } from "@suite/ui";
import { TENANT_STATUSES, type TenantStatus } from "@/lib/tenant-api";

export type StatusFilter =
  | { readonly kind: "all" }
  | { readonly kind: "status"; readonly status: TenantStatus };

export const STATUS_ALL: StatusFilter = { kind: "all" };

function statusOptions() {
  return [
    { label: "All statuses", value: "" },
    ...TENANT_STATUSES.map((status) => ({
      label: status.toLowerCase().replace(/_/g, " "),
      value: status,
    })),
  ];
}

export interface TenantListToolbarProps {
  readonly search: string;
  readonly filter: StatusFilter;
  readonly total: number | null;
  readonly isBusy: boolean;
  readonly onSearchChange: (value: string) => void;
  readonly onFilterChange: (value: StatusFilter) => void;
}

export function TenantListToolbar({
  search,
  filter,
  total,
  isBusy,
  onSearchChange,
  onFilterChange,
}: TenantListToolbarProps) {
  const selected = filter.kind === "status" ? filter.status : "";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label
          htmlFor="tenant-search"
          className="mb-1 block text-xs font-semibold text-text-secondary"
        >
          Search
        </label>
        <Input
          id="tenant-search"
          value={search}
          placeholder="Tenant name or slug"
          disabled={isBusy}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
      <div className="sm:w-52">
        <label
          htmlFor="tenant-status"
          className="mb-1 block text-xs font-semibold text-text-secondary"
        >
          Status
        </label>
        <Select
          id="tenant-status"
          value={selected}
          options={statusOptions()}
          disabled={isBusy}
          onChange={(value) =>
            onFilterChange(
              value === ""
                ? STATUS_ALL
                : { kind: "status", status: value as TenantStatus },
            )
          }
        />
      </div>
      <p className="pb-2 text-xs text-text-muted" aria-live="polite">
        {total === null ? "Count unavailable" : `${total} tenants`}
      </p>
    </div>
  );
}
