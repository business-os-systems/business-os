"use client";

import Link from "next/link";
import { LayersIcon } from "@suite/ui/icons";
import {
  isNavigationHrefActive,
  type PlatformNavGroup,
  type PlatformNavItem,
} from "./navigation.config";
import { PLATFORM_NAV_ICONS } from "./icon-registry";

const ACTIVE_ITEM_CLASS =
  "bg-brand-tint/70 font-semibold text-brand shadow-2xs before:absolute before:bottom-2 before:left-0 before:top-2 before:w-1 before:rounded-r-sm before:bg-brand";
const IDLE_ITEM_CLASS =
  "font-medium text-text-secondary hover:bg-surface-hover hover:text-text";
const ITEM_CLASS =
  "group relative flex min-h-[38px] items-center gap-3 rounded-lg px-3 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:text-[13px]";

function PlatformBrand({ collapsed }: { readonly collapsed: boolean }) {
  return (
    <div
      className={`flex h-12 flex-shrink-0 items-center gap-2.5 border-b border-border bg-surface ${
        collapsed ? "justify-center px-0" : "px-3.5"
      }`}
    >
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-brand-tint text-brand shadow-2xs">
        <LayersIcon className="h-4 w-4" />
      </div>
      {collapsed ? null : (
        <div className="flex flex-col overflow-hidden leading-tight">
          <span className="truncate text-xs font-bold tracking-tight text-text">
            Business OS
          </span>
          <span className="truncate text-[10px] font-medium text-text-muted">
            Platform Control
          </span>
        </div>
      )}
    </div>
  );
}

function PlatformSidebarLink({
  item,
  pathname,
  collapsed,
}: {
  readonly item: PlatformNavItem;
  readonly pathname: string;
  readonly collapsed: boolean;
}) {
  const active = isNavigationHrefActive(pathname, item.href);
  const Icon = PLATFORM_NAV_ICONS[item.icon];
  return (
    <Link
      href={item.href}
      prefetch={false}
      title={collapsed ? item.label : undefined}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={`${ITEM_CLASS} ${active ? ACTIVE_ITEM_CLASS : IDLE_ITEM_CLASS} ${
        collapsed ? "justify-center px-2" : ""
      }`}
    >
      <Icon
        className={`h-4 w-4 flex-shrink-0 transition-colors ${
          active ? "text-brand" : "text-text-muted group-hover:text-text"
        }`}
      />
      {collapsed ? null : <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function PlatformSidebarGroup({
  group,
  pathname,
  collapsed,
}: {
  readonly group: PlatformNavGroup;
  readonly pathname: string;
  readonly collapsed: boolean;
}) {
  return (
    <div>
      {collapsed ? null : (
        <div className="px-3 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {group.label}
        </div>
      )}
      {group.items.map((item) => (
        <PlatformSidebarLink
          key={item.id}
          item={item}
          pathname={pathname}
          collapsed={collapsed}
        />
      ))}
    </div>
  );
}

export function PlatformSidebar({
  groups,
  pathname,
  collapsed,
}: {
  readonly groups: readonly PlatformNavGroup[];
  readonly pathname: string;
  readonly collapsed: boolean;
}) {
  return (
    <aside
      className={`flex flex-col border-r border-border bg-surface ${
        collapsed ? "w-16" : "w-52 sm:w-56"
      }`}
    >
      <PlatformBrand collapsed={collapsed} />
      <nav className="flex-1 space-y-1 overflow-y-auto p-2.5" aria-label="Platform">
        {groups.map((group) => (
          <PlatformSidebarGroup
            key={group.id}
            group={group}
            pathname={pathname}
            collapsed={collapsed}
          />
        ))}
      </nav>
    </aside>
  );
}
