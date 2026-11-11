"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftIcon } from "@suite/ui/icons";
import { cn } from "@suite/ui";
import { getNavIcon } from "./icon-registry";
import {
  WEBSITE_BUILDER_APP_ICON,
  WEBSITE_BUILDER_APP_NAME,
  WEBSITE_BUILDER_BACK_LINK,
  isWebsiteBuilderNavItemActive,
  visibleWebsiteBuilderNavGroups,
  type WebsiteBuilderNavGroup,
  type WebsiteBuilderNavItem,
} from "./website-builder-nav.config";

export type WebsiteBuilderNavVariant = "sidebar" | "compact";

export interface WebsiteBuilderNavProps {
  readonly userPermissions?: readonly string[];
  readonly variant?: WebsiteBuilderNavVariant;
  readonly className?: string;
}

const NAV_ITEM_BASE =
  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-xs sm:text-[13px] min-h-[38px] transition-colors";
const NAV_ITEM_ACTIVE =
  "bg-brand-tint/70 text-brand font-semibold shadow-2xs before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-brand before:rounded-r-sm";
const NAV_ITEM_IDLE =
  "text-text-secondary hover:bg-surface-hover hover:text-text font-medium";
const COMPACT_ITEM_BASE =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors";

function SidebarItem({
  item,
  pathname,
}: {
  readonly item: WebsiteBuilderNavItem;
  readonly pathname: string;
}) {
  const isActive = isWebsiteBuilderNavItemActive(pathname, item);
  const Icon = getNavIcon(item.icon);
  return (
    <Link
      href={item.href}
      prefetch={false}
      aria-current={isActive ? "page" : undefined}
      className={cn(NAV_ITEM_BASE, isActive ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE)}
    >
      <Icon
        className={cn(
          "h-4 w-4 flex-shrink-0 transition-colors",
          isActive ? "text-brand" : "text-text-muted group-hover:text-text"
        )}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function CompactItem({
  item,
  pathname,
}: {
  readonly item: WebsiteBuilderNavItem;
  readonly pathname: string;
}) {
  const isActive = isWebsiteBuilderNavItemActive(pathname, item);
  const Icon = getNavIcon(item.icon);
  return (
    <Link
      href={item.href}
      prefetch={false}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        COMPACT_ITEM_BASE,
        isActive
          ? "bg-brand-tint/70 font-semibold text-brand"
          : "text-text-secondary hover:bg-surface-hover hover:text-text"
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {item.label}
    </Link>
  );
}

function CompactNavigation({
  pathname,
  groups,
  className,
}: {
  readonly pathname: string;
  readonly groups: readonly WebsiteBuilderNavGroup[];
  readonly className?: string;
}) {
  return (
    <nav
      aria-label={`${WEBSITE_BUILDER_APP_NAME} destinations`}
      className={cn(
        "flex items-center gap-1 overflow-x-auto border-b border-border bg-surface px-3 py-2",
        className
      )}
    >
      {groups.flatMap((group) =>
        group.items.map((item) => (
          <CompactItem key={item.id} item={item} pathname={pathname} />
        ))
      )}
      <Link
        href={WEBSITE_BUILDER_BACK_LINK.href}
        prefetch={false}
        className="ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-text-muted hover:bg-surface-hover hover:text-text"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        {WEBSITE_BUILDER_BACK_LINK.label}
      </Link>
    </nav>
  );
}

function SidebarNavigation({
  pathname,
  groups,
  className,
}: {
  readonly pathname: string;
  readonly groups: readonly WebsiteBuilderNavGroup[];
  readonly className?: string;
}) {
  const AppIcon = getNavIcon(WEBSITE_BUILDER_APP_ICON);
  return (
    <aside
      className={cn(
        "flex w-60 flex-shrink-0 flex-col border-r border-border bg-surface",
        className
      )}
    >
      <div className="flex h-12 flex-shrink-0 items-center gap-2 border-b border-border px-4">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-tint text-brand">
          <AppIcon className="h-3.5 w-3.5" />
        </div>
        <span className="truncate text-xs font-bold tracking-tight text-text">
          {WEBSITE_BUILDER_APP_NAME}
        </span>
      </div>
      <nav className="flex-1 space-y-3 overflow-y-auto p-2.5">
        {groups.map((group, groupIndex) => (
          <div
            key={group.id}
            className={cn("space-y-0.5", groupIndex > 0 && "border-t border-border pt-2.5")}
          >
            <div className="px-3 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {group.label}
            </div>
            {group.items.map((item) => (
              <SidebarItem key={item.id} item={item} pathname={pathname} />
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-2.5">
        <Link
          href={WEBSITE_BUILDER_BACK_LINK.href}
          prefetch={false}
          className="flex min-h-[38px] items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
        >
          <ArrowLeftIcon className="h-4 w-4 flex-shrink-0" />
          {WEBSITE_BUILDER_BACK_LINK.label}
        </Link>
      </div>
    </aside>
  );
}

export function WebsiteBuilderNav({
  userPermissions,
  variant = "sidebar",
  className,
}: WebsiteBuilderNavProps) {
  const pathname = usePathname();
  const groups = visibleWebsiteBuilderNavGroups(userPermissions);

  if (variant === "compact") {
    return (
      <CompactNavigation pathname={pathname} groups={groups} className={className} />
    );
  }
  return (
    <SidebarNavigation pathname={pathname} groups={groups} className={className} />
  );
}
