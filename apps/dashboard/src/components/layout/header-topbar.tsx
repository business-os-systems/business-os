"use client";

import React from "react";
import { Badge, Button } from "@suite/ui";
import { MenuIcon, BuildingIcon, LogOutIcon } from "@suite/ui/icons";
import type { TenantContext } from "./types";

interface HeaderTopbarProps {
  tenant?: TenantContext;
  onToggleSidebar?: () => void;
}

export function HeaderTopbar({
  tenant = {
    organizationId: "org-primary-workspace",
    organizationName: "Business OS Workspace",
    activeBranchName: "Primary Operations (Main Branch)",
  },
  onToggleSidebar,
}: HeaderTopbarProps) {
  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore network errors on logout
    }
    window.location.href = "/login";
  };

  return (
    <header className="flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="flex items-center gap-4">
        {onToggleSidebar && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            className="text-slate-500 hover:text-slate-900"
            aria-label="Toggle Navigation"
          >
            <MenuIcon className="h-5 w-5" />
          </Button>
        )}
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">
            {tenant.organizationName}
          </span>
          <Badge variant="secondary" className="text-xs">
            Enterprise
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700">
          <BuildingIcon className="h-4 w-4 text-slate-500" />
          <span>{tenant.activeBranchName}</span>
        </div>

        <div className="flex items-center gap-3 pl-2 border-l border-slate-200">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
            RB
          </div>
          <div className="hidden md:flex flex-col text-left">
            <span className="text-xs font-semibold text-slate-900">
              Rohit Bahuguna
            </span>
            <span className="text-[10px] text-slate-500 font-medium">
              Platform Admin
            </span>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="text-slate-500 hover:text-red-600 hover:bg-red-50 text-xs gap-1.5 px-2"
          title="Sign out of workspace"
        >
          <LogOutIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Sign Out</span>
        </Button>
      </div>
    </header>
  );
}
