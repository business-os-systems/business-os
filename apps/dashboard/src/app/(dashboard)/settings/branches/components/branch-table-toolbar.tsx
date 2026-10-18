"use client";

import React from "react";
import { Button, Input, PlusIcon } from "@suite/ui";
import {
  BRANCH_STATUS_FILTERS,
  type BranchStatusFilterOption,
} from "../branches.config";

export interface BranchTableToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  canWrite: boolean;
  onAddBranch: () => void;
  statusFilters?: readonly BranchStatusFilterOption[];
}

export function BranchTableToolbar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  canWrite,
  onAddBranch,
  statusFilters = BRANCH_STATUS_FILTERS,
}: BranchTableToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-4 border-b border-border">
      {/* Search Input */}
      <div className="relative flex-1 max-w-sm">
        <Input
          type="search"
          placeholder="Search by name, code, type, city..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full text-xs"
        />
      </div>

      {/* Filter Pills & Add Button */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          {statusFilters.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onStatusFilterChange(opt.id)}
              className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors cursor-pointer ${
                statusFilter === opt.id
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
            onClick={onAddBranch}
            className="flex items-center gap-1.5 font-semibold text-xs py-1.5 h-auto ml-1"
          >
            <PlusIcon className="h-4 w-4" />
            <span>Add Branch</span>
          </Button>
        )}
      </div>
    </div>
  );
}
