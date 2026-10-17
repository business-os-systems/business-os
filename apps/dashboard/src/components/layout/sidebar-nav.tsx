"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge, type NavigationConfig, type NavItemConfig } from "@suite/ui";
import { hasPermission } from "@suite/core";
import { LayersIcon } from "@suite/ui/icons";
import type { NavigationItem } from "./types";
import { baseNavigationConfig } from "./navigation.config";
import { getNavIcon } from "./icon-registry";

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
  const current = (currentPath.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
  const target = (itemHref.split("?")[0] ?? "").replace(/\/+$/, "") || "/";

  if (target === "/" || target === "/dashboard") {
    return current === "/" || current === "/dashboard";
  }

  if (target.startsWith("/settings")) {
    return current.startsWith("/settings");
  }

  return current === target || current.startsWith(`${target}/`);
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
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? "border border-brand bg-brand-tint text-brand font-semibold shadow-xs"
            : "text-text-secondary hover:bg-surface-hover hover:text-text"
        } ${collapsed ? "justify-center px-2" : ""}`}
        title={collapsed ? item.name : undefined}
      >
        <IconComponent
          className={`h-5 w-5 flex-shrink-0 ${
            isActive ? "text-brand" : "text-text-muted"
          }`}
        />
        {!collapsed && (
          <div className="flex flex-1 items-center justify-between overflow-hidden">
            <span className="truncate">{item.name}</span>
            {item.badge && (
              <Badge
                variant={isActive ? "default" : "secondary"}
                className="text-[10px] py-0 px-1.5"
              >
                {item.badge}
              </Badge>
            )}
          </div>
        )}
      </Link>
    );
  };

  return (
    <aside
      className={`flex flex-col border-r border-border bg-surface transition-all duration-200 h-screen ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="flex h-16 items-center border-b border-border px-4 gap-3 bg-surface flex-shrink-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-tint text-brand shadow-sm flex-shrink-0">
          <LayersIcon className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="flex flex-col overflow-hidden">
            <span className="font-bold text-text text-sm tracking-tight truncate">
              Business OS
            </span>
            <span className="text-xs text-text-muted font-medium truncate">
              Enterprise Suite
            </span>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
        <div className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          {!collapsed ? "Installed Apps" : "Apps"}
        </div>
        {authorizedTopItems.map(renderNavItem)}
      </nav>

      <div className="p-3 border-t border-border bg-surface space-y-2 flex-shrink-0">
        {authorizedBottomItems.map(renderNavItem)}

        {!collapsed ? (
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-action-tint border border-action/30">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-action animate-pulse" />
              <span className="text-xs font-semibold text-action">
                System Online
              </span>
            </div>
            <Badge
              variant="tertiary"
              className="text-[9px] py-0 px-1.5 font-mono"
            >
              v2.0
            </Badge>
          </div>
        ) : (
          <div className="flex justify-center py-1" title="System Online v2.0">
            <span className="h-2 w-2 rounded-full bg-action animate-pulse" />
          </div>
        )}
      </div>
    </aside>
  );
}
