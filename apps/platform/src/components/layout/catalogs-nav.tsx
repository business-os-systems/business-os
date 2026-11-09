"use client";

import { usePathname } from "next/navigation";
import { HubNav, type HubNavGroup } from "./hub-nav";
import {
  CATALOGS_BACK_LINK,
  CATALOGS_NAV_GROUP_LABEL,
  visibleCatalogsNavItems,
} from "./catalogs-nav.config";
import { CATALOGS_NAV_ICONS } from "./catalogs-nav-icons";

export function CatalogsNav({
  capabilities,
}: {
  readonly capabilities: readonly string[];
}) {
  const pathname = usePathname();
  const groups: HubNavGroup[] = [
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

  return (
    <HubNav
      title="Reference catalogs"
      ariaLabel="Reference catalogs"
      mobileAriaLabel="Reference catalog"
      groups={groups}
      footer={CATALOGS_BACK_LINK}
      pathname={pathname}
    />
  );
}
