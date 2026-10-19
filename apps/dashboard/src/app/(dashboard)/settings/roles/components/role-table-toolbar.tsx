"use client";

import React from "react";
import { Input, Button, PlusIcon } from "@suite/ui";
import type { RoleStatusFilterOption } from "../roles.config";

export interface RoleTableToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  statusOptions: readonly RoleStatusFilterOption[];
  onCreateClick: () => void;
  canManageRoles: boolean;
}

export function RoleTableToolbar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statusOptions,
  onCreateClick,
  canManageRoles,
}: RoleTableToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-4 border-b border-border">
      {/* Search Input */}
      <div className="relative flex-1 max-w-sm">
        <Input
          type="search"
          placeholder="Search roles by name, slug, description..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full text-xs"
        />
      </div>

      {/* Filter Pills & Actions */}
      <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
        <div className="flex items-center gap-1">
          {statusOptions.map((opt) => (
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

        {canManageRoles && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onCreateClick}
            className="flex items-center gap-1.5 shrink-0 text-xs font-semibold cursor-pointer"
          >
            <PlusIcon size={14} className="stroke-[2.5]" />
            <span>Create Role</span>
          </Button>
        )}
      </div>
    </div>
  );
}
