"use client";

import { usePathname } from "next/navigation";
import { HubNavMobileSwitcher, HubNavSidebar, type HubNavGroup } from "./hub-nav";
import {
  APP_RECORD_BACK_LINK,
  appRecordHref,
  visibleAppRecordGroups,
} from "./app-record-nav.config";
import { APP_RECORD_ICONS } from "./app-record-icons";

const APP_RECORD_TITLE = "Application record";
const APP_RECORD_MOBILE_ARIA_LABEL = "Application record section";

function appRecordGroups(appId: string, capabilities: readonly string[]): HubNavGroup[] {
  return visibleAppRecordGroups(capabilities).map((group) => ({
    id: group.id,
    label: group.label,
    items: group.items.map((item) => ({
      id: item.id,
      label: item.label,
      href: appRecordHref(appId, item.segment),
      icon: APP_RECORD_ICONS[item.icon],
    })),
  }));
}

export function AppRecordNavSidebar({
  appId,
  capabilities,
}: {
  readonly appId: string;
  readonly capabilities: readonly string[];
}) {
  const pathname = usePathname();
  return (
    <HubNavSidebar
      title={APP_RECORD_TITLE}
      ariaLabel={APP_RECORD_TITLE}
      groups={appRecordGroups(appId, capabilities)}
      footer={APP_RECORD_BACK_LINK}
      pathname={pathname}
    />
  );
}

export function AppRecordMobileSwitcher({
  appId,
  capabilities,
}: {
  readonly appId: string;
  readonly capabilities: readonly string[];
}) {
  const pathname = usePathname();
  return (
    <HubNavMobileSwitcher
      mobileAriaLabel={APP_RECORD_MOBILE_ARIA_LABEL}
      groups={appRecordGroups(appId, capabilities)}
      footer={APP_RECORD_BACK_LINK}
      pathname={pathname}
    />
  );
}
