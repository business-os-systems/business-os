"use client";

import type { ReactNode } from "react";
import { isCatalogsHubRoute } from "./catalogs-nav.config";
import { CatalogsMobileSwitcher, CatalogsNavSidebar } from "./catalogs-nav";
import {
  isTenantRecordHubRoute,
  tenantRecordOrgIdFromPathname,
} from "./tenant-record-nav.config";
import {
  TenantRecordMobileSwitcher,
  TenantRecordNavSidebar,
} from "./tenant-record-nav";

export interface PlatformHubNavProps {
  readonly pathname: string;
  readonly capabilities: readonly string[];
  readonly allowed: boolean;
}

/**
 * The shell renders hub navigation beside the content column (H-3.3), exactly
 * like Dashboard renders `SettingsNav`. The hub therefore spans the viewport
 * and never scrolls with its panel.
 */
export function PlatformHubNavSidebar({
  pathname,
  capabilities,
  allowed,
}: PlatformHubNavProps) {
  if (!allowed) {
    return null;
  }
  if (isTenantRecordHubRoute(pathname)) {
    const orgId = tenantRecordOrgIdFromPathname(pathname);
    if (orgId === null) {
      return null;
    }
    return (
      <TenantRecordNavSidebar orgId={orgId} capabilities={capabilities} />
    );
  }
  if (isCatalogsHubRoute(pathname)) {
    return <CatalogsNavSidebar capabilities={capabilities} />;
  }
  return null;
}

function HubMobileBar({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex-shrink-0 border-b border-border bg-surface px-3 py-2 md:hidden">
      {children}
    </div>
  );
}

/** Below `md` the sidebar is replaced by a compact switcher (H-3.12). */
export function PlatformHubMobileSwitcher({
  pathname,
  capabilities,
  allowed,
}: PlatformHubNavProps) {
  if (!allowed) {
    return null;
  }
  if (isTenantRecordHubRoute(pathname)) {
    const orgId = tenantRecordOrgIdFromPathname(pathname);
    if (orgId === null) {
      return null;
    }
    return (
      <HubMobileBar>
        <TenantRecordMobileSwitcher
          orgId={orgId}
          capabilities={capabilities}
        />
      </HubMobileBar>
    );
  }
  if (isCatalogsHubRoute(pathname)) {
    return (
      <HubMobileBar>
        <CatalogsMobileSwitcher capabilities={capabilities} />
      </HubMobileBar>
    );
  }
  return null;
}
