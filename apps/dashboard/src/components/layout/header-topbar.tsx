"use client";

import React from "react";
import { Button } from "@suite/ui";
import { MenuIcon, BuildingIcon, LogOutIcon } from "@suite/ui/icons";
import { ThemeToggle } from "./theme-toggle";
import type { TenantContext } from "./types";
import { isBrowser } from "@/lib/env";

import { WorkspaceSwitcher } from "./workspace-switcher";

interface HeaderTopbarProps {
  tenant?: TenantContext;
  onToggleSidebar?: () => void;
}

export function HeaderTopbar({
  tenant,
  onToggleSidebar,
}: HeaderTopbarProps) {
  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore network errors on logout
    }
    if (isBrowser) {
      window.location.assign("/login");
    }
  };

  const userInitials = tenant?.userInitials ?? (tenant?.userName
    ? tenant.userName
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "");

  return (
    <header className="flex h-16 w-full items-center justify-between border-b border-border-hairline bg-surface-container-lowest px-6">
      <div className="flex items-center gap-4">
        {onToggleSidebar && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            className="text-on-surface-variant hover:text-on-surface"
            aria-label="Toggle Navigation"
          >
            <MenuIcon className="h-5 w-5" />
          </Button>
        )}
        <WorkspaceSwitcher
          activeOrganizationId={tenant?.organizationId}
          activeOrganizationName={tenant?.organizationName}
        />
      </div>

      <div className="flex items-center gap-4">
        {tenant?.activeBranchName && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-tertiary-container/20 border border-tertiary/20 text-xs font-semibold text-tertiary">
            <BuildingIcon className="h-4 w-4 text-tertiary" />
            <span>{tenant.activeBranchName}</span>
          </div>
        )}

        {(tenant?.userName || userInitials) && (
          <div className="flex items-center gap-3 pl-2 border-l border-border-hairline">
            {userInitials && (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container text-xs font-semibold text-white">
                {userInitials}
              </div>
            )}
            <div className="hidden md:flex flex-col text-left">
              {tenant?.userName && (
                <span className="text-xs font-semibold text-on-surface">
                  {tenant.userName}
                </span>
              )}
              {tenant?.userRole && (
                <span className="text-[10px] text-on-surface-variant font-medium">
                  {tenant.userRole}
                </span>
              )}
            </div>
          </div>
        )}

        <ThemeToggle />

        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="text-text-muted hover:text-danger hover:bg-danger/10 text-xs gap-1.5 px-2"
          title="Sign out of workspace"
        >
          <LogOutIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Sign Out</span>
        </Button>
      </div>
    </header>
  );
}
