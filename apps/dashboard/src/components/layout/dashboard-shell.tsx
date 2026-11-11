"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { SidebarNav } from "./sidebar-nav";
import { SettingsNav } from "./settings-nav";
import { WebsiteBuilderNav } from "./website-builder-nav";
import {
  WEBSITE_BUILDER_APP_ID,
  isWebsiteBuilderAppRoute,
} from "./website-builder-nav.config";
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

type ActiveHub = "workspace" | "settings" | "website-builder";

function resolveActiveHub(
  settingsActive: boolean,
  websiteBuilderActive: boolean
): ActiveHub {
  if (settingsActive) {
    return "settings";
  }
  if (websiteBuilderActive) {
    return "website-builder";
  }
  return "workspace";
}

function HubSidebarNav({
  hub,
  userPermissions,
}: {
  readonly hub: ActiveHub;
  readonly userPermissions?: readonly string[];
}) {
  switch (hub) {
    case "settings":
      return (
        <SettingsNav className="hidden md:flex flex-shrink-0" userPermissions={userPermissions} />
      );
    case "website-builder":
      return (
        <WebsiteBuilderNav
          variant="sidebar"
          className="hidden md:flex"
          userPermissions={userPermissions}
        />
      );
    case "workspace":
      return null;
  }
}

function HubCompactNav({
  hub,
  userPermissions,
}: {
  readonly hub: ActiveHub;
  readonly userPermissions?: readonly string[];
}) {
  if (hub !== "website-builder") {
    return null;
  }
  return (
    <WebsiteBuilderNav
      variant="compact"
      className="md:hidden"
      userPermissions={userPermissions}
    />
  );
}

export function DashboardShell({
  tenant,
  initialInstalledApps = [],
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [installedApps, setInstalledApps] =
    useState<readonly InstalledAppNavInput[]>(initialInstalledApps);

  useEffect(() => {
    setInstalledApps(initialInstalledApps);
  }, [initialInstalledApps]);

  const navConfig = buildNavigationConfig(installedApps);
  const websiteBuilderInstalled = installedApps.some(
    (app) => app.id === WEBSITE_BUILDER_APP_ID
  );
  const websiteBuilderActive =
    isWebsiteBuilderAppRoute(pathname) && websiteBuilderInstalled;
  const activeHub = resolveActiveHub(
    isSettingsHubRoute(pathname),
    websiteBuilderActive
  );

  // Entering a hub collapses the workspace rail to 64px and docks its panel.
  const isSidebarCollapsed = activeHub !== "workspace" || collapsed;

  return (
    <div className="flex h-screen h-dvh w-full overflow-hidden bg-background text-text">
      <SidebarNav
        collapsed={isSidebarCollapsed}
        config={navConfig}
        userPermissions={tenant?.userPermissions}
      />
      <HubSidebarNav hub={activeHub} userPermissions={tenant?.userPermissions} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <HeaderTopbar
          tenant={tenant}
          onToggleSidebar={() => setCollapsed(!collapsed)}
        />
        <HubCompactNav hub={activeHub} userPermissions={tenant?.userPermissions} />
        <VerifiedSuccessBanner />
        {tenant?.userEmailVerified === false ? (
          <UnverifiedEmailBanner email={tenant?.userEmail} />
        ) : null}
        <main className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 flex flex-col">{children}</main>
      </div>
    </div>
  );
}
