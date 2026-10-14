"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@suite/ui";
import {
  GlobeIcon,
  ShoppingCartIcon,
  BuildingIcon,
  PackageIcon,
  SettingsIcon,
  HomeIcon,
  LayersIcon,
} from "@suite/ui/icons";
import type { NavigationItem } from "./types";

const APP_ICONS: Record<string, React.FC<{ className?: string }>> = {
  home: HomeIcon,
  sites: GlobeIcon,
  website_builder: GlobeIcon,
  pos: ShoppingCartIcon,
  restaurant_pos: ShoppingCartIcon,
  pms: BuildingIcon,
  lodging_pms: BuildingIcon,
  inventory: PackageIcon,
  stock_inventory: PackageIcon,
  settings: SettingsIcon,
};

interface SidebarNavProps {
  collapsed?: boolean;
  items?: NavigationItem[];
}

export function SidebarNav({ collapsed = false, items = [] }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`flex flex-col border-r border-border bg-surface transition-all duration-200 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="flex h-16 items-center border-b border-border px-4 gap-3 bg-surface">
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
        {items.map((item) => {
          const currentPath = pathname ?? "/";
          const isActive =
            item.href === "/"
              ? currentPath === "/"
              : currentPath.startsWith(item.href);
          const IconComponent =
            APP_ICONS[item.icon] || APP_ICONS[item.id] || HomeIcon;

          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border border-brand bg-brand-tint text-brand font-semibold shadow-xs"
                  : "text-text-secondary hover:bg-surface-hover hover:text-text"
              }`}
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
        })}
      </nav>

      {!collapsed && (
        <div className="p-3 border-t border-border bg-surface">
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
        </div>
      )}
    </aside>
  );
}
