"use client";

import type { KeyboardEvent, RefObject } from "react";
import { cn } from "@suite/ui";
import { TENANT_TABS, nextTabId, type TenantTabId } from "./tenant-record-tabs";

export interface TenantRecordTabListProps {
  readonly tab: TenantTabId;
  readonly onSelect: (tab: TenantTabId) => void;
  readonly tabRefs: RefObject<Record<string, HTMLButtonElement | null> | null>;
}

export function TenantRecordTabList({
  tab,
  onSelect,
  tabRefs,
}: TenantRecordTabListProps) {
  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    current: TenantTabId,
  ): void {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }
    event.preventDefault();
    const target = nextTabId(
      current,
      event.key === "ArrowRight" ? "next" : "previous",
    );
    onSelect(target);
    tabRefs.current?.[target]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Tenant record"
      className="flex gap-1 border-b border-border"
    >
      {TENANT_TABS.map((entry) => {
        const isActive = tab === entry.id;
        return (
          <button
            key={entry.id}
            ref={(node) => {
              if (tabRefs.current !== null) {
                tabRefs.current[entry.id] = node;
              }
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`tenant-tab-${entry.id}`}
            id={`tenant-tab-button-${entry.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(entry.id)}
            onKeyDown={(event) => handleKeyDown(event, entry.id)}
            className={cn(
              "-mb-px h-10 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
              isActive
                ? "border-action text-text"
                : "border-transparent text-text-secondary hover:text-text",
            )}
          >
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}
