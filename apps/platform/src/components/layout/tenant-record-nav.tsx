"use client";

import { usePathname } from "next/navigation";
import { HubNav, type HubNavGroup } from "./hub-nav";
import {
  TENANT_RECORD_BACK_LINK,
  tenantRecordItemHref,
  visibleTenantRecordGroups,
} from "./tenant-record-nav.config";
import { TENANT_RECORD_ICONS } from "./tenant-record-icons";

export function TenantRecordNav({
  orgId,
  capabilities,
}: {
  readonly orgId: string;
  readonly capabilities: readonly string[];
}) {
  const pathname = usePathname();
  const groups: HubNavGroup[] = visibleTenantRecordGroups(capabilities).map(
    (group) => ({
      id: group.id,
      label: group.label,
      items: group.items.map((item) => ({
        id: item.id,
        label: item.label,
        href: tenantRecordItemHref(orgId, item),
        icon: TENANT_RECORD_ICONS[item.icon],
      })),
    }),
  );

  return (
    <HubNav
      title="Tenant record"
      ariaLabel="Tenant record"
      mobileAriaLabel="Tenant record section"
      groups={groups}
      footer={TENANT_RECORD_BACK_LINK}
      pathname={pathname}
    />
  );
}
