import {
  PLATFORM_APPS_READ_CAPABILITIES,
  type PlatformCapability,
} from "@suite/core";
import { hasPlatformCapability } from "@/lib/capability";

/**
 * Application record hub configuration (Hub Navigation Law H-3.5/H-3.13).
 *
 * Every destination is declared here and rendered as a route. Adding a panel is
 * a config edit; no component knows the list by name. Reading destinations come
 * first, then the content catalog and the operational rollout and activity
 * views; the preview route is reachable by item id without becoming a menu
 * entry (FR-001, FR-160).
 */

export type AppRecordNavItemId =
  | "overview"
  | "settings"
  | "sections"
  | "templates"
  | "themes"
  | "rollout"
  | "activity";

/**
 * The icon registry is exhaustive for the keys it already declares. Rollout and
 * activity reuse a declared key rather than inventing an unregistered icon
 * (H-3.7); registering a distinct glyph is a separate, additive change.
 */
export type AppRecordIconKey = Exclude<AppRecordNavItemId, "rollout" | "activity">;

export const APP_RECORD_ROUTE_PREFIX = "/apps";

export const APP_RECORD_OVERVIEW_SEGMENT = "overview";
export const APP_RECORD_PREVIEW_SEGMENT = "preview";

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
  {
    id: "catalog",
    label: "Content catalog",
    items: [
      {
        id: "sections",
        label: "Sections",
        segment: "sections",
        icon: "sections",
        capabilities: PLATFORM_APPS_READ_CAPABILITIES,
      },
      {
        id: "templates",
        label: "Templates",
        segment: "templates",
        icon: "templates",
        capabilities: PLATFORM_APPS_READ_CAPABILITIES,
      },
      {
        id: "themes",
        label: "Themes",
        segment: "themes",
        icon: "themes",
        capabilities: PLATFORM_APPS_READ_CAPABILITIES,
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      {
        id: "rollout",
        label: "Rollout",
        segment: "rollout",
        icon: "settings",
        capabilities: PLATFORM_APPS_READ_CAPABILITIES,
      },
      {
        id: "activity",
        label: "Activity",
        segment: "activity",
        icon: "sections",
        capabilities: PLATFORM_APPS_READ_CAPABILITIES,
      },
    ],
  },
];

export function appRecordHref(appId: string, segment: string): string {
  return `${APP_RECORD_ROUTE_PREFIX}/${encodeURIComponent(appId)}/${segment}`;
}

export function appRecordPreviewHref(appId: string, itemId: string): string {
  return `${appRecordHref(appId, APP_RECORD_PREVIEW_SEGMENT)}/${encodeURIComponent(itemId)}`;
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
function matchId(match: RegExpExecArray | null, index: number): string | null {
  const value = match?.[index];
  return value !== undefined && isAppRecordId(value) ? value : null;
}

function isDeclaredDestination(appId: string | null, segment: string | undefined): boolean {
  if (appId === null || segment === undefined) {
    return false;
  }
  return APP_RECORD_NAV_GROUPS.some((group) =>
    group.items.some((item) => item.segment === segment),
  );
}

export function isAppRecordKnownDestination(pathname: string): boolean {
  const recordRoot = /^\/apps\/([^/]+)\/?$/.exec(pathname);
  if (recordRoot !== null) {
    return matchId(recordRoot, 1) !== null;
  }
  const destination = /^\/apps\/([^/]+)\/([^/]+)\/?$/.exec(pathname);
  if (destination !== null) {
    return isDeclaredDestination(matchId(destination, 1), destination[2]);
  }
  const preview = /^\/apps\/([^/]+)\/preview\/([^/]+)\/?$/.exec(pathname);
  if (preview === null) {
    return false;
  }
  return matchId(preview, 1) !== null && matchId(preview, 2) !== null;
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
