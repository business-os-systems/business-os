"use client";

import React from "react";
import { Select } from "@suite/ui";
import type { InquirySelectFilter } from "./inquiries.config";

export interface InquiryFilterValues {
  readonly status: string | null;
  readonly siteId: string | null;
}

export function InquiryFilterBar({
  filters,
  values,
  onChange,
}: {
  readonly filters: readonly InquirySelectFilter[];
  readonly values: InquiryFilterValues;
  readonly onChange: (id: InquirySelectFilter["id"], value: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Inquiry filters">
      {filters.map((filter) => {
        const selected = values[filter.id] ?? "";
        const options = [
          { label: filter.allLabel, value: "" },
          ...filter.options,
        ];
        return (
          <div key={filter.id} className="w-48 space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {filter.label}
            </span>
            <Select
              aria-label={filter.label}
              value={selected}
              options={options}
              onChange={(value) => onChange(filter.id, value.length === 0 ? null : value)}
            />
          </div>
        );
      })}
    </div>
  );
}
