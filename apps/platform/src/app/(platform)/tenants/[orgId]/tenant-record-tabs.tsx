"use client";

import type { ComponentType, ReactNode } from "react";
import type { TenantRecord } from "@/lib/tenant-api";
import { TenantAuditPanel } from "./tenant-audit-panel";
import { TenantEntitlementsPanel } from "./tenant-entitlements-panel";
import { TenantOverviewPanel } from "./tenant-overview-panel";
import { TenantQuotasPanel } from "./tenant-quotas-panel";

/**
 * Labels follow the Platform design specification section 3. Settings and
 * Danger are not offered yet: entitlements stay read-only until the
 * entitlement slice lands, and no destructive tenant action exists until the
 * lifecycle slice does.
 */
export const TENANT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "entitlements", label: "Entitlements" },
  { id: "quotas", label: "Quotas" },
  { id: "audit", label: "Audit" },
] as const;

export type TenantTabId = (typeof TENANT_TABS)[number]["id"];

export function nextTabId(
  current: TenantTabId,
  direction: "next" | "previous",
): TenantTabId {
  const order = TENANT_TABS.map((tab) => tab.id);
  const index = order.indexOf(current);
  const step = direction === "next" ? 1 : -1;
  const nextIndex = (index + step + order.length) % order.length;
  return order[nextIndex] ?? current;
}

interface TabPanel {
  readonly record: TenantRecord;
  readonly personalDataSlot: ReactNode;
  readonly canReadReason: boolean;
}

const TAB_COMPONENTS: Record<TenantTabId, ComponentType<TabPanel>> = {
  overview: ({ record, personalDataSlot }) => (
    <TenantOverviewPanel record={record} personalDataSlot={personalDataSlot} />
  ),
  entitlements: ({ record }) => <TenantEntitlementsPanel apps={record.apps} />,
  quotas: ({ record }) => <TenantQuotasPanel quotas={record.quotas} />,
  audit: ({ record, canReadReason }) => (
    <TenantAuditPanel
      lifecycle={record.lifecycle}
      audit={record.recentAudit}
      lifecycleHasMore={record.lifecycleHasMore}
      canReadReason={canReadReason}
    />
  ),
};

export function TenantTabPanel({
  tab,
  record,
  personalDataSlot,
  canReadReason,
}: {
  readonly tab: TenantTabId;
  readonly record: TenantRecord;
  readonly personalDataSlot: ReactNode;
  readonly canReadReason: boolean;
}) {
  const Panel = TAB_COMPONENTS[tab];
  return (
    <Panel
      record={record}
      personalDataSlot={personalDataSlot}
      canReadReason={canReadReason}
    />
  );
}
