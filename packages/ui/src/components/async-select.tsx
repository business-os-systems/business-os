"use client";

import React, { useState, useEffect, useCallback } from "react";
import { cn } from "../lib/utils.js";
import { Spinner } from "./spinner.js";
import { Button } from "./button.js";
import { Select, type SelectOption, type SelectProps } from "./select.js";

export interface AsyncSelectProps extends Omit<SelectProps, "options"> {
  /**
   * Async data loader function returning options from an API endpoint, database, or remote service.
   */
  loadOptions: () => Promise<SelectOption[]>;
  /**
   * Static fallback options displayed if the async loader has not resolved or errors.
   */
  fallbackOptions?: SelectOption[];
  /**
   * Custom loading indicator label.
   */
  loadingMessage?: string;
  /**
   * Custom error message displayed if loading fails.
   */
  errorMessage?: string;
  /**
   * Custom empty state label if the loader returns 0 options.
   */
  emptyMessage?: string;
  /**
   * Optional callback when options finish loading.
   */
  onLoaded?: (options: SelectOption[]) => void;
}

/**
 * AsyncSelect
 *
 * Dynamic dropdown primitive for remote datasets, APIs, and database lookups.
 * Handles loading spinners, network error recoveries, and renders standardized
 * DESIGN.md options list once resolved.
 */
export function AsyncSelect({
  loadOptions,
  fallbackOptions = [],
  loadingMessage = "Loading options...",
  errorMessage = "Failed to load options",
  emptyMessage = "No options available",
  disabled,
  placeholder = "Select...",
  className,
  onLoaded,
  ...selectProps
}: AsyncSelectProps) {
  const [options, setOptions] = useState<SelectOption[]>(fallbackOptions);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await loadOptions();
      setOptions(data);
      onLoaded?.(data);
    } catch (err) {
      console.error("[AsyncSelect] Error loading options:", err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [loadOptions, errorMessage, onLoaded]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (isLoading) {
    return (
      <div
        className={cn(
          "w-full h-10 px-3 py-2 flex items-center justify-between rounded-lg border border-border bg-surface-muted text-xs text-text-muted select-none",
          className,
        )}
      >
        <span className="truncate">{loadingMessage}</span>
        <Spinner size="sm" className="h-4 w-4 text-action shrink-0" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "w-full h-10 px-3 py-1.5 flex items-center justify-between rounded-lg border border-danger/30 bg-danger/10 text-xs text-danger",
          className,
        )}
      >
        <span className="truncate">{error}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void fetchData()}
          className="h-7 px-2 text-[11px] text-danger hover:bg-danger/20 font-semibold"
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <Select
      options={options}
      disabled={disabled}
      placeholder={options.length === 0 ? emptyMessage : placeholder}
      className={className}
      {...selectProps}
    />
  );
}
