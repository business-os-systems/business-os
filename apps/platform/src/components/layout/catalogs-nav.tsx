"use client";

import { usePathname } from "next/navigation";
import {
  HubNavMobileSwitcher,
  HubNavSidebar,
  type HubNavGroup,
} from "./hub-nav";
import {
  CATALOGS_BACK_LINK,
  CATALOGS_NAV_GROUP_LABEL,
  visibleCatalogsNavItems,
} from "./catalogs-nav.config";
import { CATALOGS_NAV_ICONS } from "./catalogs-nav-icons";

const CATALOGS_TITLE = "Reference catalogs";
const CATALOGS_MOBILE_ARIA_LABEL = "Reference catalog";

function catalogsGroups(capabilities: readonly string[]): HubNavGroup[] {
  return [
    {
      id: "reference",
      label: CATALOGS_NAV_GROUP_LABEL,
      items: visibleCatalogsNavItems(capabilities).map((item) => ({
        id: item.id,
        label: item.label,
        href: item.href,
        icon: CATALOGS_NAV_ICONS[item.icon],
      })),
    },
  ];
}

export function CatalogsNavSidebar({
  capabilities,
}: {
  readonly capabilities: readonly string[];
}) {
  const pathname = usePathname();
  return (
    <HubNavSidebar
      title={CATALOGS_TITLE}
      ariaLabel={CATALOGS_TITLE}
      groups={catalogsGroups(capabilities)}
      footer={CATALOGS_BACK_LINK}
      pathname={pathname}
    />
  );
}

export function CatalogsMobileSwitcher({
  capabilities,
}: {
  readonly capabilities: readonly string[];
}) {
  const pathname = usePathname();
  return (
    <HubNavMobileSwitcher
      mobileAriaLabel={CATALOGS_MOBILE_ARIA_LABEL}
      groups={catalogsGroups(capabilities)}
      footer={CATALOGS_BACK_LINK}
      pathname={pathname}
    />
  );
}
