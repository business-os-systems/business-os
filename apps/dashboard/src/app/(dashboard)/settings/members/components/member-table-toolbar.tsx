"use client";

import React from "react";
import { Button, Input, PlusIcon, MailIcon } from "@suite/ui";
import {
  MEMBER_STATUS_FILTERS,
  type MemberStatusFilterOption,
} from "../members.config";

export interface MemberTableToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  canManage: boolean;
  onAddMember: () => void;
  onInviteMember: () => void;
  statusFilters?: readonly MemberStatusFilterOption[];
}

export function MemberTableToolbar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  canManage,
  onAddMember,
  onInviteMember,
  statusFilters = MEMBER_STATUS_FILTERS,
}: MemberTableToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-4 border-b border-border">
      {/* Search Input */}
      <div className="relative flex-1 max-w-sm">
        <Input
          type="search"
          placeholder="Search by name, email, role..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full text-xs"
        />
      </div>

      {/* Filter Pills & Action Buttons */}
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

        {canManage && (
          <div className="flex items-center gap-2 ml-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddMember}
              className="flex items-center gap-1.5 font-semibold text-xs py-1.5 h-auto cursor-pointer"
            >
              <PlusIcon className="h-4 w-4" />
              <span>Add Member</span>
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={onInviteMember}
              className="flex items-center gap-1.5 font-semibold text-xs py-1.5 h-auto cursor-pointer"
            >
              <MailIcon className="h-3.5 w-3.5" />
              <span>Invite Member</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
