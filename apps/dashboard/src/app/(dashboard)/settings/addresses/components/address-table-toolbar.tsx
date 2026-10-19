"use client";

import React from "react";
import { Button, Input, PlusIcon } from "@suite/ui";

export interface AddressTableToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filter: "ALL" | "LINKED" | "UNLINKED";
  onFilterChange: (filter: "ALL" | "LINKED" | "UNLINKED") => void;
  canWrite: boolean;
  onAddAddress: () => void;
}

export function AddressTableToolbar({
  searchQuery,
  onSearchChange,
  filter,
  onFilterChange,
  canWrite,
  onAddAddress,
}: AddressTableToolbarProps) {
  const filterOptions = [
    { id: "ALL", label: "All Addresses" },
    { id: "LINKED", label: "Linked / In Use" },
    { id: "UNLINKED", label: "Unlinked / Standby" },
  ] as const;

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-4 border-b border-border">
      {/* Search Input */}
      <div className="relative flex-1 max-w-sm">
        <Input
          type="search"
          placeholder="Search by street, city, state, postal code..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full text-xs"
        />
      </div>

      {/* Filter Pills & Add Button */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          {filterOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onFilterChange(opt.id)}
              className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors cursor-pointer ${
                filter === opt.id
                  ? "bg-brand text-on-brand shadow-xs"
                  : "bg-surface text-text-muted hover:text-text hover:bg-surface-hover border border-border"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {canWrite && (
          <Button
            type="button"
            size="sm"
            onClick={onAddAddress}
            className="flex items-center gap-1.5 font-semibold text-xs py-1.5 h-auto ml-1"
          >
            <PlusIcon className="h-4 w-4" />
            <span>Add Address</span>
          </Button>
        )}
      </div>
    </div>
  );
}
