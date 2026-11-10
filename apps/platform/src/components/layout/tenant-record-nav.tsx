"use client";

import { usePathname } from "next/navigation";
import {
  HubNavMobileSwitcher,
  HubNavSidebar,
  type HubNavGroup,
} from "./hub-nav";
import {
  TENANT_RECORD_BACK_LINK,
  tenantRecordItemHref,
  visibleTenantRecordGroups,
} from "./tenant-record-nav.config";
import { TENANT_RECORD_ICONS } from "./tenant-record-icons";

const TENANT_RECORD_TITLE = "Tenant record";
const TENANT_RECORD_MOBILE_ARIA_LABEL = "Tenant record section";

function tenantRecordGroups(
  orgId: string,
  capabilities: readonly string[],
): HubNavGroup[] {
  return visibleTenantRecordGroups(capabilities).map((group) => ({
    id: group.id,
    label: group.label,
    items: group.items.map((item) => ({
      id: item.id,
      label: item.label,
      href: tenantRecordItemHref(orgId, item),
      icon: TENANT_RECORD_ICONS[item.icon],
    })),
  }));
}

export function TenantRecordNavSidebar({
  orgId,
  capabilities,
}: {
  readonly orgId: string;
  readonly capabilities: readonly string[];
}) {
  const pathname = usePathname();
  return (
    <HubNavSidebar
      title={TENANT_RECORD_TITLE}
      ariaLabel={TENANT_RECORD_TITLE}
      groups={tenantRecordGroups(orgId, capabilities)}
      footer={TENANT_RECORD_BACK_LINK}
      pathname={pathname}
    />
  );
}

export function TenantRecordMobileSwitcher({
  orgId,
  capabilities,
}: {
  readonly orgId: string;
  readonly capabilities: readonly string[];
}) {
  const pathname = usePathname();
  return (
    <HubNavMobileSwitcher
      mobileAriaLabel={TENANT_RECORD_MOBILE_ARIA_LABEL}
      groups={tenantRecordGroups(orgId, capabilities)}
      footer={TENANT_RECORD_BACK_LINK}
      pathname={pathname}
    />
  );
}
