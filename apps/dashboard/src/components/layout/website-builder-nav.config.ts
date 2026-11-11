import { PERMISSIONS, hasPermission } from "@suite/core";
import { WORKSPACE_ROOT, workspacePath } from "@/lib/workspace-paths";
import type { NavIconKey } from "./icon-registry";

/**
 * Website Builder application hub configuration (FR-124 to FR-130, FR-158 to
 * FR-161; Hub Navigation Law H-3.5/H-3.6/H-3.13).
 *
 * Every destination is declared here and rendered as its own route. No
 * component knows the destination list by name, so adding a destination is a
 * configuration edit plus the route it points at. Groups follow the reading
 * order of the hub; configuration is a separate group, never a panel inside
 * the sites overview.
 */

export const WEBSITE_BUILDER_APP_ID = "website-builder" as const;
export const WEBSITE_BUILDER_APP_NAME = "Website Builder" as const;
export const WEBSITE_BUILDER_APP_ICON: NavIconKey = "sites";

export const WEBSITE_BUILDER_HUB_ROOT = "/websites" as const;
/**
 * Route root of the site surfaces (create, onboarding, studio). It carries no
 * legacy meaning: the browser address is always the workspace path below.
 */
export const WEBSITE_BUILDER_SITES_ROUTE_ROOT = "/sites" as const;

export const WEBSITE_BUILDER_BACK_LINK = {
  label: "Back to workspace",
  href: WORKSPACE_ROOT,
} as const;

export const WEBSITE_BUILDER_CREATE_SITE_HREF = workspacePath("/sites/onboarding");
/** The App Router route is `(studio)/sites/[siteId]/studio/[pageId]`. */
export const WEBSITE_BUILDER_STUDIO_SEGMENT = "studio" as const;

/**
 * The studio is a route of this application, so its path is declared once. The
 * workspace root is applied here too: the browser address is
 * `/dashboard/sites/*`, while bare `/sites/*` is the App Router root that the
 * rewrite serves behind it.
 */
export function websiteBuilderStudioHref(siteId: string, pageId: string): string {
  return workspacePath(
    `${WEBSITE_BUILDER_SITES_ROUTE_ROOT}/${encodeURIComponent(siteId)}/${WEBSITE_BUILDER_STUDIO_SEGMENT}/${encodeURIComponent(pageId)}`
  );
}

export type WebsiteBuilderDestinationId = "overview" | "inquiries" | "settings";
export type WebsiteBuilderNavMatch = "exact" | "prefix";
export type WebsiteBuilderDenialReason =
  | "app_not_installed"
  | "capability_denied"
  | "entitlements_unavailable";

export interface WebsiteBuilderNavItem {
  readonly id: WebsiteBuilderDestinationId;
  readonly label: string;
  readonly href: string;
  readonly icon: NavIconKey;
  readonly match: WebsiteBuilderNavMatch;
  readonly capabilities: readonly string[];
}

export interface WebsiteBuilderNavGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly WebsiteBuilderNavItem[];
}

export const WEBSITE_BUILDER_NAV_GROUPS: readonly WebsiteBuilderNavGroup[] = [
  {
    id: "workspace",
    label: "Website Builder",
    items: [
      {
        id: "overview",
        label: "Overview",
        href: WEBSITE_BUILDER_HUB_ROOT,
        icon: "home",
        match: "exact",
        capabilities: [PERMISSIONS.WEBSITE_BUILDER.SITES_READ],
      },
      {
        id: "inquiries",
        label: "Inquiries",
        href: `${WEBSITE_BUILDER_HUB_ROOT}/inquiries`,
        icon: "inquiries",
        match: "prefix",
        capabilities: [PERMISSIONS.WEBSITE_BUILDER.LEADS_READ],
      },
    ],
  },
  {
    id: "configuration",
    label: "Configuration",
    items: [
      {
        id: "settings",
        label: "Settings",
        href: `${WEBSITE_BUILDER_HUB_ROOT}/settings`,
        icon: "settings",
        match: "prefix",
        capabilities: [PERMISSIONS.WEBSITE_BUILDER.SITES_WRITE],
      },
    ],
  },
];

export const WEBSITE_BUILDER_ACCESS_DENIED_COPY = {
  app_not_installed: {
    title: "Website Builder is not installed",
    detail:
      "This workspace does not include the Website Builder application. A workspace owner can install it from Applications.",
  },
  capability_denied: {
    title: "You do not have access",
    detail:
      "Your role does not include the capability required to open this Website Builder destination.",
  },
  entitlements_unavailable: {
    title: "Website Builder is unavailable",
    detail:
      "We could not verify this workspace's application entitlements. No websites or studio content were loaded.",
  },
} as const satisfies Record<
  WebsiteBuilderDenialReason,
  { readonly title: string; readonly detail: string }
>;

function isPathWithin(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

/**
 * True for the /websites hub and the workspace site surfaces (create,
 * onboarding, studio), so the shell collapses the workspace rail consistently.
 * Bare /sites is not matched: it is not a workspace address.
 */
export function isWebsiteBuilderAppRoute(
  pathname: string | null | undefined
): boolean {
  const path = pathname ?? "";
  return (
    isPathWithin(path, WEBSITE_BUILDER_HUB_ROOT) ||
    isPathWithin(path, workspacePath(WEBSITE_BUILDER_SITES_ROUTE_ROOT))
  );
}

export function isWebsiteBuilderNavItemActive(
  pathname: string,
  item: WebsiteBuilderNavItem
): boolean {
  if (item.match === "exact") {
    return pathname === item.href;
  }
  return isPathWithin(pathname, item.href);
}

/**
 * Fail-closed visibility: a missing or empty capability list resolves to an
 * empty hub, never an ungated one (H-3.6). Groups whose items are all hidden
 * disappear entirely so a section header is never rendered without content.
 */
export function visibleWebsiteBuilderNavGroups(
  permissions: readonly string[] | undefined | null
): WebsiteBuilderNavGroup[] {
  if (permissions === undefined || permissions === null || permissions.length === 0) {
    return [];
  }
  return WEBSITE_BUILDER_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      item.capabilities.some((capability) => hasPermission(permissions, capability))
    ),
  })).filter((group) => group.items.length > 0);
}
