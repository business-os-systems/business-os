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

const APP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  home: HomeIcon,
  sites: GlobeIcon,
  pos: ShoppingCartIcon,
  pms: BuildingIcon,
  inventory: PackageIcon,
  settings: SettingsIcon,
};

export const NAVIGATION_APPS: NavigationItem[] = [
  {
    id: "home",
    name: "Overview",
    href: "/",
    icon: "home",
    description: "Executive Business Summary",
  },
  {
    id: "sites",
    name: "Website Builder",
    href: "/sites",
    icon: "sites",
    badge: "App 01",
    description: "Storefronts & Headless CMS",
  },
  {
    id: "pos",
    name: "Restaurant POS",
    href: "/pos",
    icon: "pos",
    badge: "App 04",
    description: "Counter & Kitchen Terminal",
  },
  {
    id: "pms",
    name: "Lodging PMS",
    href: "/pms",
    icon: "pms",
    badge: "App 03",
    description: "Rooms & Front Desk",
  },
  {
    id: "inventory",
    name: "Central Stock",
    href: "/inventory",
    icon: "inventory",
    badge: "App 05",
    description: "Warehouses & Requisitions",
  },
  {
    id: "settings",
    name: "Settings",
    href: "/settings",
    icon: "settings",
    description: "Tenant & Branch Config",
  },
];

interface SidebarNavProps {
  collapsed?: boolean;
}

export function SidebarNav({ collapsed = false }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`flex flex-col border-r border-slate-200 bg-white transition-all duration-200 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="flex h-16 items-center border-b border-slate-200 px-4 gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm flex-shrink-0">
          <LayersIcon className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="flex flex-col overflow-hidden">
            <span className="font-bold text-slate-900 text-sm tracking-tight truncate">
              Business OS
            </span>
            <span className="text-xs text-slate-500 font-medium truncate">
              Enterprise Suite
            </span>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
        <div className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {!collapsed ? "Installed Apps" : "Apps"}
        </div>
        {NAVIGATION_APPS.map((item) => {
          const currentPath = pathname || "/";
          const isActive =
            item.href === "/"
              ? currentPath === "/"
              : currentPath.startsWith(item.href);
          const IconComponent = APP_ICONS[item.icon] || HomeIcon;

          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-50 text-blue-700 shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
              title={collapsed ? item.name : undefined}
            >
              <IconComponent
                className={`h-5 w-5 flex-shrink-0 ${
                  isActive ? "text-blue-600" : "text-slate-400"
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
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-slate-600">
              Cluster Status: Operational
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}
