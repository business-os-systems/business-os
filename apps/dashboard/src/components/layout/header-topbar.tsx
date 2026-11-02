"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button, ThemeToggle } from "@suite/ui";
import { MenuIcon, BuildingIcon, LogOutIcon } from "@suite/ui/icons";
import type { TenantContext } from "./types";

import { WorkspaceSwitcher } from "./workspace-switcher";

interface HeaderTopbarProps {
  tenant?: Partial<TenantContext>;
  onToggleSidebar?: () => void;
}

export function HeaderTopbar({
  tenant,
  onToggleSidebar,
}: HeaderTopbarProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (error) {
      console.error("[HeaderTopbar] Logout network error:", error);
    }
    router.push("/login");
    router.refresh();
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
    <header className="flex h-12 w-full items-center justify-between border-b border-border bg-surface-container-lowest px-3 sm:px-5">
      <div className="flex items-center gap-2 sm:gap-3">
        {onToggleSidebar && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            className="h-8 w-8 text-on-surface-variant hover:text-on-surface"
            aria-label="Toggle Navigation"
          >
            <MenuIcon className="h-4 w-4" />
          </Button>
        )}
        <div className="hidden sm:flex items-center">
          <WorkspaceSwitcher
            activeOrganizationId={tenant?.organizationId}
            activeOrganizationName={tenant?.organizationName}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {tenant?.activeBranchName && (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-tertiary-container/20 border border-tertiary/20 text-[11px] font-semibold text-tertiary">
            <BuildingIcon className="h-3.5 w-3.5 text-tertiary" />
            <span>{tenant.activeBranchName}</span>
          </div>
        )}

        {(tenant?.userName || userInitials) && (
          <div className="flex items-center gap-2.5 pl-2.5 border-l border-border">
            {userInitials && (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-container text-[11px] font-semibold text-white">
                {userInitials}
              </div>
            )}
            <div className="hidden md:flex flex-col text-left leading-tight">
              {tenant?.userName && (
                <span className="text-xs font-semibold text-on-surface truncate max-w-[130px]">
                  {tenant.userName}
                </span>
              )}
              {tenant?.userRole && (
                <span className="text-[10px] text-on-surface-variant font-medium truncate max-w-[130px]">
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
          className="text-text-muted hover:text-danger hover:bg-danger/10 text-xs gap-1.5 px-2 h-7"
          title="Sign out of workspace"
        >
          <LogOutIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Sign Out</span>
        </Button>
      </div>
    </header>
  );
}
