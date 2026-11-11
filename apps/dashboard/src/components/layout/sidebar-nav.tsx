"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavigationConfig, NavItemConfig } from "@suite/ui";
import { hasPermission } from "@suite/core";
import { LayersIcon } from "@suite/ui/icons";
import type { NavigationItem } from "./types";
import { baseNavigationConfig } from "./navigation.config";
import { getNavIcon } from "./icon-registry";
import { isWorkspaceNavTargetActive } from "@/lib/workspace-paths";

export interface SidebarNavProps {
  collapsed?: boolean;
  items?: NavigationItem[];
  config?: NavigationConfig;
  userPermissions?: readonly string[];
}

/**
 * Determines whether a navigation item is active based on the current URL pathname.
 * Avoids nested ternaries and fragile substring collisions.
 */
export function isRouteActive(currentPath: string, itemHref: string): boolean {
  return isWorkspaceNavTargetActive(currentPath, itemHref);
}

export function SidebarNav({
  collapsed = false,
  items,
  config,
  userPermissions,
}: SidebarNavProps) {
  const pathname = usePathname();

  // Strictly consume top and bottom items from NavigationConfig
  const effectiveConfig =
    config ??
    (items ? { topItems: items, bottomItems: [] } : baseNavigationConfig);
  const topItems = effectiveConfig.topItems;
  const bottomItems = effectiveConfig.bottomItems;

  // Capability-based permission evaluator: STRICTLY FAIL-CLOSED
  const isItemAuthorized = (item: NavItemConfig | NavigationItem): boolean => {
    const permission = (item as NavItemConfig).permission;
    // Un-gated items (like universal Overview) are visible to all authenticated tenant users
    if (!permission) return true;
    // Strict fail-closed: missing or empty permissions context strictly denies access to capability-gated items
    if (!userPermissions || userPermissions.length === 0) return false;
    return hasPermission(userPermissions, permission);
  };

  const authorizedTopItems = topItems.filter(isItemAuthorized);
  const authorizedBottomItems = bottomItems.filter(isItemAuthorized);

  const renderNavItem = (item: NavItemConfig | NavigationItem) => {
    const currentPath = pathname ?? "/";
    const isActive = isRouteActive(currentPath, item.href);
    const IconComponent = getNavIcon(item.icon);

    return (
      <Link
        key={item.id}
        href={item.href}
        prefetch={false}
        className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-xs sm:text-[13px] min-h-[38px] transition-colors ${
          isActive
            ? "bg-brand-tint/70 text-brand font-semibold shadow-2xs before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-brand before:rounded-r-sm"
            : "text-text-secondary hover:bg-surface-hover hover:text-text font-medium"
        } ${collapsed ? "justify-center px-2" : ""}`}
        title={item.name}
      >
        <IconComponent
          className={`h-4 w-4 flex-shrink-0 transition-colors ${
            isActive ? "text-brand" : "text-text-muted group-hover:text-text"
          }`}
        />
        {!collapsed && (
          <div className="flex flex-1 items-center justify-between gap-1 overflow-hidden">
            <span className="truncate">{item.name}</span>
            {item.badge ? <span className="text-[10px] font-medium text-text-muted px-1.5 py-0.5 rounded bg-surface-muted border border-border shrink-0">
                {item.badge}
              </span> : null}
          </div>
        )}
      </Link>
    );
  };

  return (
    <aside
      className={`flex flex-col border-r border-border bg-surface transition-all duration-200 h-screen h-dvh ${
        collapsed ? "w-16" : "w-52 sm:w-56"
      }`}
    >
      <div
        className={`flex h-12 items-center border-b border-border bg-surface flex-shrink-0 ${
          collapsed ? "justify-center px-0" : "px-3.5 gap-2.5"
        }`}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-tint text-brand shadow-2xs flex-shrink-0">
          <LayersIcon className="h-4 w-4" />
        </div>
        {!collapsed && (
          <div className="flex flex-col overflow-hidden leading-tight">
            <span className="font-bold text-text text-xs tracking-tight truncate">
              Business OS
            </span>
            <span className="text-[10px] text-text-muted font-medium truncate">
              Enterprise Suite
            </span>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-2.5 overflow-y-auto">
        <div className="px-3 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {!collapsed ? "Installed Apps" : "Apps"}
        </div>
        {authorizedTopItems.map(renderNavItem)}

        {authorizedBottomItems.length > 0 && (
          <div className="pt-2 mt-2 border-t border-border space-y-1">
            {!collapsed && (
              <div className="px-3 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                System
              </div>
            )}
            {authorizedBottomItems.map(renderNavItem)}
          </div>
        )}
      </nav>
    </aside>
  );
}
