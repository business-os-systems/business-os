import {
  CATALOG_DEFINITIONS,
  CATALOG_KEYS,
  PLATFORM_CAPABILITIES,
  type CatalogKey,
  type PlatformCapability,
} from "@suite/core";
import { hasPlatformCapability } from "@/lib/capability";

/**
 * Catalogs hub configuration (Hub Navigation Law H-3.5/H-3.13).
 *
 * The ten catalog keys and labels live in the shared @suite/core registry, so
 * adding a catalog is a config-only change and the TypeScript compiler rejects
 * an unregistered key. Every destination is a route; no client state selects a
 * catalog (H-3.2).
 */

export type CatalogsNavIconKey = "catalog";

export interface CatalogsNavItem {
  readonly id: CatalogKey;
  readonly label: string;
  readonly href: string;
  readonly icon: CatalogsNavIconKey;
  readonly capability: PlatformCapability;
}

export const CATALOGS_ROUTE_PREFIX = "/catalogs";

export const CATALOGS_NAV_GROUP_LABEL = "Reference data";

export const CATALOGS_BACK_LINK = {
  label: "Overview",
  href: "/",
} as const;

export function catalogsHref(key: CatalogKey): string {
  return `${CATALOGS_ROUTE_PREFIX}/${key}`;
}

export const CATALOGS_NAV_ITEMS: readonly CatalogsNavItem[] = CATALOG_KEYS.map(
  (key) => ({
    id: key,
    label: CATALOG_DEFINITIONS[key].label,
    href: catalogsHref(key),
    icon: "catalog",
    capability: PLATFORM_CAPABILITIES.CATALOGS_MANAGE.code,
  }),
);

/** Hub routes are /catalogs and every catalog below it, never a nested page. */
export function isCatalogsHubRoute(pathname: string): boolean {
  return (
    pathname === CATALOGS_ROUTE_PREFIX ||
    pathname.startsWith(`${CATALOGS_ROUTE_PREFIX}/`)
  );
}

/** Fail-closed visibility: missing or empty capabilities resolve to no items. */
export function visibleCatalogsNavItems(
  capabilities: readonly string[] | undefined | null,
): readonly CatalogsNavItem[] {
  return CATALOGS_NAV_ITEMS.filter((item) =>
    hasPlatformCapability(capabilities, item.capability),
  );
}
