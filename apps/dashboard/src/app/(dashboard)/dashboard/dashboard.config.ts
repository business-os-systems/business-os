import type { DashboardOverviewConfig, AppLauncherItemConfig } from "@suite/ui";

/**
 * Baseline declarative overview dashboard configuration.
 * Governed by Constitution Principle XIII (Config-Based UI Primacy Law)
 * and AGENTS.md Zero Static Data Law.
 */
export const defaultDashboardOverviewConfig: DashboardOverviewConfig = {
  title: "Executive App Launcher",
  subtitle:
    "Welcome to your Business OS workspace. Select an installed module to launch its environment.",
  apps: [],
};

export type { DashboardOverviewConfig, AppLauncherItemConfig };

/**
 * Transforms raw app attributes into strongly typed declarative AppLauncherItemConfig.
 */
export function buildLauncherItemConfig(app: {
  id: string;
  title: string;
  description: string;
  href: string;
  iconName?: string;
  isAvailable?: boolean;
  status?: "Available" | "Coming Soon";
  permission?: string;
  badge?: string;
}): AppLauncherItemConfig {
  const isAvailable = app.isAvailable !== false && app.status !== "Coming Soon";
  return {
    id: app.id,
    title: app.title,
    description: app.description,
    href: app.href,
    icon: app.iconName || app.id,
    status: isAvailable ? "Available" : "Coming Soon",
    isAvailable,
    permission: app.permission,
    badge: app.badge,
  };
}
