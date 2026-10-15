"use client";

import React, { useState, useEffect } from "react";
import { SidebarNav } from "./sidebar-nav";
import { HeaderTopbar } from "./header-topbar";
import { UnverifiedEmailBanner } from "./unverified-email-banner";
import { VerifiedSuccessBanner } from "./verified-success-banner";
import type { TenantContext, NavigationItem } from "./types";
import { BASE_NAV_ITEMS } from "./types";

interface DashboardShellProps {
  tenant?: TenantContext;
  initialNavItems?: NavigationItem[];
  children: React.ReactNode;
}

export function DashboardShell({
  tenant,
  initialNavItems,
  children,
}: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [navItems, setNavItems] = useState<NavigationItem[]>(
    initialNavItems && initialNavItems.length > 0 ? initialNavItems : BASE_NAV_ITEMS,
  );

  useEffect(() => {
    if (initialNavItems && initialNavItems.length > 0) {
      setNavItems(initialNavItems);
    }
  }, [initialNavItems]);

  useEffect(() => {
    async function fetchApps() {
      if (!tenant?.organizationId) return;
      try {
        const res = await fetch(
          `/api/v1/organizations/${tenant.organizationId}/installed-apps`,
        );
        if (res.ok) {
          const data = await res.json();
          const rawApps = Array.isArray(data.apps)
            ? data.apps
            : data.installedApps || [];

          const items: NavigationItem[] = [
            ...BASE_NAV_ITEMS,
            ...rawApps.map((app: {
              appId: string;
              name?: string;
              title?: string;
              href?: string;
              iconName?: string;
              code?: string;
              description?: string;
            }) => ({
              id: app.appId,
              name: app.name || app.title || app.appId,
              href: app.href || `/${app.appId}`,
              icon: app.iconName || app.appId,
              badge: app.code,
              description: app.description || "",
            })),
          ];

          setNavItems(items);
        }
      } catch {
        // Retain existing navItems gracefully
      }
    }
    fetchApps();
  }, [tenant?.organizationId]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-text">
      <SidebarNav collapsed={collapsed} items={navItems} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <HeaderTopbar
          tenant={tenant}
          onToggleSidebar={() => setCollapsed(!collapsed)}
        />
        <VerifiedSuccessBanner />
        {tenant?.userEmailVerified === false && (
          <UnverifiedEmailBanner email={tenant?.userEmail} />
        )}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
