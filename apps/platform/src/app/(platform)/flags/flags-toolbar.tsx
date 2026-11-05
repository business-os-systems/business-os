"use client";

import { Button, Select } from "@suite/ui";
import { FLAG_ENVIRONMENT_OPTIONS } from "@/lib/flags-api";
import {
  ENVIRONMENT_ALL,
  isEnvironmentFilter,
  type EnvironmentFilter,
} from "./use-flags";

const ENVIRONMENT_OPTIONS = [
  { label: "All environments", value: ENVIRONMENT_ALL },
  ...FLAG_ENVIRONMENT_OPTIONS,
];

interface FlagsToolbarProps {
  readonly environment: EnvironmentFilter;
  readonly total: number;
  readonly isBusy: boolean;
  readonly onChange: (value: EnvironmentFilter) => void;
  readonly onCreate: () => void;
}

export function FlagsToolbar({
  environment,
  total,
  isBusy,
  onChange,
  onCreate,
}: FlagsToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-48">
          <label
            htmlFor="flags-environment-filter"
            className="sr-only"
          >
            Environment
          </label>
          <Select
            id="flags-environment-filter"
            value={environment}
            options={ENVIRONMENT_OPTIONS}
            disabled={isBusy}
            onChange={(value) => {
              if (isEnvironmentFilter(value)) {
                onChange(value);
              }
            }}
          />
        </div>
        <span className="text-xs text-text-secondary">
          Showing {total} {total === 1 ? "flag" : "flags"}
        </span>
      </div>
      <Button onClick={onCreate}>New flag</Button>
    </div>
  );
}
