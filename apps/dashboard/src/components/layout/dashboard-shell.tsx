"use client";

import React, { useState, useEffect } from "react";
import { SidebarNav } from "./sidebar-nav";
import { HeaderTopbar } from "./header-topbar";
import type { TenantContext, NavigationItem } from "./types";

interface DashboardShellProps {
  tenant?: TenantContext;
  children: React.ReactNode;
}

export function DashboardShell({ tenant, children }: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [navItems, setNavItems] = useState<NavigationItem[] | undefined>(
    undefined,
  );

  useEffect(() => {
    async function fetchApps() {
      if (!tenant?.organizationId) return;
      try {
        const res = await fetch(
          `/api/v1/organizations/${tenant.organizationId}/installed-apps`,
        );
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

          const rawApps = Array.isArray(data.apps)
            ? data.apps
            : data.installedApps || [];
          for (const app of rawApps) {
            items.push({
              id: app.appId,
              name: app.name,
              href: app.href,
              icon: app.iconName,
              badge: app.code,
              description: app.description,
            });
          }

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
        <HeaderTopbar
          tenant={tenant}
          onToggleSidebar={() => setCollapsed(!collapsed)}
        />
        <main className="flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
