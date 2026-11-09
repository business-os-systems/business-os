"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Select, cn } from "@suite/ui";
import { ArrowLeftIcon } from "@suite/ui/icons";

export interface HubNavIconProps {
  readonly className?: string;
}

export interface HubNavItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: ComponentType<HubNavIconProps>;
}

export interface HubNavGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly HubNavItem[];
}

export interface HubNavFooter {
  readonly label: string;
  readonly href: string;
}

export interface HubNavProps {
  readonly title: string;
  readonly ariaLabel: string;
  readonly mobileAriaLabel: string;
  readonly groups: readonly HubNavGroup[];
  readonly footer: HubNavFooter;
  readonly pathname: string;
}

const ACTIVE_ITEM_CLASS =
  "bg-brand-tint/70 font-semibold text-brand shadow-2xs before:absolute before:bottom-2 before:left-0 before:top-2 before:w-1 before:rounded-r-sm before:bg-brand";
const IDLE_ITEM_CLASS =
  "font-medium text-text-secondary hover:bg-surface-hover hover:text-text";
const ITEM_CLASS =
  "group relative flex min-h-[38px] items-center gap-3 rounded-lg px-3 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:text-[13px]";
const OVERLINE_CLASS =
  "px-3 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted";

export function isHubHrefActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function HubNavLink({
  item,
  pathname,
}: {
  readonly item: HubNavItem;
  readonly pathname: string;
}) {
  const active = isHubHrefActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      className={cn(ITEM_CLASS, active ? ACTIVE_ITEM_CLASS : IDLE_ITEM_CLASS)}
    >
      <Icon
        className={cn(
          "h-4 w-4 flex-shrink-0 transition-colors",
          active ? "text-brand" : "text-text-muted group-hover:text-text",
        )}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function HubNavGroupBlock({
  group,
  pathname,
}: {
  readonly group: HubNavGroup;
  readonly pathname: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className={OVERLINE_CLASS}>{group.label}</div>
      {group.items.map((item) => (
        <HubNavLink key={item.id} item={item} pathname={pathname} />
      ))}
    </div>
  );
}

function HubNavFooterLink({ footer }: { readonly footer: HubNavFooter }) {
  return (
    <div className="flex-shrink-0 border-t border-border p-2.5">
      <Link
        href={footer.href}
        prefetch={false}
        className="flex min-h-[38px] items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        <span>{footer.label}</span>
      </Link>
    </div>
  );
}

function HubNavMobileSwitcher({
  groups,
  footer,
  pathname,
  mobileAriaLabel,
}: {
  readonly groups: readonly HubNavGroup[];
  readonly footer: HubNavFooter;
  readonly pathname: string;
  readonly mobileAriaLabel: string;
}) {
  const router = useRouter();
  const options = groups.flatMap((group) =>
    group.items.map((item) => ({
      value: item.href,
      label: item.label,
      description: group.label,
    })),
  );
  const active = options.find((option) =>
    isHubHrefActive(pathname, option.value),
  );
  return (
    <div className="flex items-center gap-2 md:hidden">
      {options.length === 0 ? null : (
        <Select
          aria-label={mobileAriaLabel}
          value={active?.value ?? ""}
          options={options}
          placeholder="Go to section"
          direction="down"
          onChange={(href) => router.push(href)}
        />
      )}
      <Link
        href={footer.href}
        prefetch={false}
        aria-label={footer.label}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface text-text-secondary hover:bg-surface-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <ArrowLeftIcon className="h-4 w-4" />
      </Link>
    </div>
  );
}

/** One 240px hub sidebar shared by every Platform hub (H-3.3 to H-3.12). */
export function HubNav({
  title,
  ariaLabel,
  mobileAriaLabel,
  groups,
  footer,
  pathname,
}: HubNavProps) {
  return (
    <>
      <aside className="hidden w-60 flex-shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-12 flex-shrink-0 items-center border-b border-border px-3.5">
          <span className="text-xs font-bold tracking-tight text-text">
            {title}
          </span>
        </div>
        <nav
          className="flex-1 space-y-3 overflow-y-auto p-2.5"
          aria-label={ariaLabel}
        >
          {groups.map((group) => (
            <HubNavGroupBlock key={group.id} group={group} pathname={pathname} />
          ))}
        </nav>
        <HubNavFooterLink footer={footer} />
      </aside>
      <HubNavMobileSwitcher
        groups={groups}
        footer={footer}
        pathname={pathname}
        mobileAriaLabel={mobileAriaLabel}
      />
    </>
  );
}
