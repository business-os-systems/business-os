import {
  PLATFORM_APPS_READ_CAPABILITIES,
  type PlatformCapability,
} from "@suite/core";
import { hasPlatformCapability } from "@/lib/capability";

/**
 * Application record hub configuration (Hub Navigation Law H-3.5/H-3.13).
 *
 * Every destination is declared here and rendered as a route. Adding a panel is
 * a config edit; no component knows the list by name. The record currently has
 * one reading destination; settings and the content catalog append their own
 * entries when those slices land.
 */

export type AppRecordNavItemId = "overview" | "settings";

export type AppRecordIconKey = AppRecordNavItemId;

export const APP_RECORD_ROUTE_PREFIX = "/apps";

export const APP_RECORD_OVERVIEW_SEGMENT = "overview";

const APP_RECORD_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export const APP_RECORD_BACK_LINK = {
  label: "All applications",
  href: APP_RECORD_ROUTE_PREFIX,
} as const;

export interface AppRecordNavItem {
  readonly id: AppRecordNavItemId;
  readonly label: string;
  readonly segment: string;
  readonly icon: AppRecordIconKey;
  readonly capabilities: readonly PlatformCapability[];
}

export interface AppRecordNavGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly AppRecordNavItem[];
}

export const APP_RECORD_NAV_GROUPS: readonly AppRecordNavGroup[] = [
  {
    id: "record",
    label: "Application",
    items: [
      {
        id: "overview",
        label: "Overview",
        segment: APP_RECORD_OVERVIEW_SEGMENT,
        icon: "overview",
        capabilities: PLATFORM_APPS_READ_CAPABILITIES,
      },
      {
        id: "settings",
        label: "Settings",
        segment: "settings",
        icon: "settings",
        capabilities: PLATFORM_APPS_READ_CAPABILITIES,
      },
    ],
  },
];

export function appRecordHref(appId: string, segment: string): string {
  return `${APP_RECORD_ROUTE_PREFIX}/${encodeURIComponent(appId)}/${segment}`;
}

/** Hub routes are /apps/<id> and every destination below it, never /apps. */
export function isAppRecordHubRoute(pathname: string): boolean {
  return /^\/apps\/[^/]+(?:\/|$)/.test(pathname);
}

export function isAppRecordId(value: string): boolean {
  return APP_RECORD_ID_PATTERN.test(value);
}

/**
 * Reads the application id out of a hub pathname so the shell can render the
 * record navigation. Only registry-shaped ids are accepted, so a dot segment
 * cannot become a navigation target.
 */
export function appRecordIdFromPathname(pathname: string): string | null {
  const match = /^\/apps\/([^/]+)(?:\/|$)/.exec(pathname);
  const value = match?.[1];
  return value !== undefined && isAppRecordId(value) ? value : null;
}

/**
 * True only for the record root and a destination declared in this config.
 * The shell uses it so an unconfigured sub-path is denied, not merely unknown
 * to the menu (H-3.2, H-3.13).
 */
export function isAppRecordKnownDestination(pathname: string): boolean {
  const recordRoot = /^\/apps\/[^/]+\/?$/.exec(pathname);
  if (recordRoot !== null) {
    return true;
  }
  const destination = /^\/apps\/[^/]+\/([^/]+)\/?$/.exec(pathname);
  if (destination === null) {
    return false;
  }
  const segment = destination[1];
  return APP_RECORD_NAV_GROUPS.some((group) =>
    group.items.some((item) => item.segment === segment),
  );
}

/**
 * Fail-closed visibility: a missing or empty capability list resolves to an
 * empty hub, never an ungated one (H-3.6).
 */
export function visibleAppRecordGroups(
  capabilities: readonly string[] | undefined | null,
): AppRecordNavGroup[] {
  return APP_RECORD_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      item.capabilities.some((capability) =>
        hasPlatformCapability(capabilities, capability),
      ),
    ),
  })).filter((group) => group.items.length > 0);
}
