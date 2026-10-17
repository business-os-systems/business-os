"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { SidebarNav } from "./sidebar-nav";
import { SettingsNav } from "./settings-nav";
import { HeaderTopbar } from "./header-topbar";
import { UnverifiedEmailBanner } from "./unverified-email-banner";
import { VerifiedSuccessBanner } from "./verified-success-banner";
import type { TenantContext } from "./types";
import {
  buildNavigationConfig,
  type InstalledAppNavInput,
} from "./navigation.config";
import { isSettingsHubRoute } from "./settings.config";

interface DashboardShellProps {
  tenant?: TenantContext;
  initialInstalledApps?: readonly InstalledAppNavInput[];
  children: React.ReactNode;
}

export function DashboardShell({
  tenant,
  initialInstalledApps = [],
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const isSettingsActive = isSettingsHubRoute(pathname);

  const [collapsed, setCollapsed] = useState(false);
  const [installedApps, setInstalledApps] = useState<readonly InstalledAppNavInput[]>(
    initialInstalledApps
  );

  useEffect(() => {
    if (initialInstalledApps) {
      setInstalledApps(initialInstalledApps);
    }
  }, [initialInstalledApps]);

  const navConfig = buildNavigationConfig(installedApps);

  // Auto-collapse primary sidebar when entering Core Settings Hub
  const isSidebarCollapsed = isSettingsActive || collapsed;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-text">
      <SidebarNav
        collapsed={isSidebarCollapsed}
        config={navConfig}
        userPermissions={tenant?.userPermissions}
      />
      {isSettingsActive && (
        <SettingsNav
          className="hidden md:flex flex-shrink-0"
          userPermissions={tenant?.userPermissions}
        />
      )}
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
