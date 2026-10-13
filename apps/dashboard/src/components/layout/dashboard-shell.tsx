"use client";

import React, { useState, useEffect } from "react";
import { SidebarNav } from "./sidebar-nav";
import { HeaderTopbar } from "./header-topbar";
import type { TenantContext, NavigationItem } from "./types";
import { KNOWN_APPS_CATALOG } from "@/lib/app-registry";

interface DashboardShellProps {
  tenant?: TenantContext;
  children: React.ReactNode;
}

export function DashboardShell({ tenant, children }: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [navItems, setNavItems] = useState<NavigationItem[] | undefined>(undefined);

  useEffect(() => {
    async function fetchApps() {
      if (!tenant?.organizationId) return;
      try {
        const res = await fetch(`/api/v1/organizations/${tenant.organizationId}/installed-apps`);
        if (res.ok) {
          const data = await res.json();
          const items: NavigationItem[] = [
            {
              id: "home",
              name: "Overview",
              href: "/",
              icon: "home",
              description: "Executive Business Summary",
            },
          ];

          for (const app of data.installedApps || []) {
            const meta = KNOWN_APPS_CATALOG[app.appId];
            if (meta) {
              items.push({
                id: meta.appId,
                name: meta.name,
                href: meta.href,
                icon: meta.iconName,
                badge: meta.code,
                description: meta.description,
              });
            }
          }

          items.push({
            id: "settings",
            name: "Settings",
            href: "/settings",
            icon: "settings",
            description: "Tenant & Branch Config",
          });

          setNavItems(items);
        }
      } catch {
        // Handled silently
      }
    }
    fetchApps();
  }, [tenant?.organizationId]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      <SidebarNav collapsed={collapsed} items={navItems} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <HeaderTopbar tenant={tenant} onToggleSidebar={() => setCollapsed(!collapsed)} />
        <main className="flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
