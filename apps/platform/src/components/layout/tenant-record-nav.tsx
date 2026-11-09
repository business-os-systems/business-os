"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Select, cn } from "@suite/ui";
import { ArrowLeftIcon } from "@suite/ui/icons";
import {
  TENANT_RECORD_BACK_LINK,
  isTenantRecordHrefActive,
  tenantRecordItemHref,
  visibleTenantRecordGroups,
  type TenantRecordNavGroup,
  type TenantRecordNavItem,
} from "./tenant-record-nav.config";
import { TENANT_RECORD_ICONS } from "./tenant-record-icons";

const ACTIVE_ITEM_CLASS =
  "bg-brand-tint/70 font-semibold text-brand shadow-2xs before:absolute before:bottom-2 before:left-0 before:top-2 before:w-1 before:rounded-r-sm before:bg-brand";
const IDLE_ITEM_CLASS =
  "font-medium text-text-secondary hover:bg-surface-hover hover:text-text";
const ITEM_CLASS =
  "group relative flex min-h-[38px] items-center gap-3 rounded-lg px-3 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:text-[13px]";
const OVERLINE_CLASS =
  "px-3 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted";

function TenantRecordNavLink({
  orgId,
  item,
  pathname,
}: {
  readonly orgId: string;
  readonly item: TenantRecordNavItem;
  readonly pathname: string;
}) {
  const href = tenantRecordItemHref(orgId, item);
  const active = isTenantRecordHrefActive(pathname, href);
  const Icon = TENANT_RECORD_ICONS[item.icon];
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      className={cn(ITEM_CLASS, active ? ACTIVE_ITEM_CLASS : IDLE_ITEM_CLASS)}
    >
      <Icon
        className={cn(
          "h-4 w-4 flex-shrink-0 transition-colors",
          active ? "text-brand" : "text-text-muted group-hover:text-text"
        )}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function TenantRecordGroupBlock({
  group,
  orgId,
  pathname,
}: {
  readonly group: TenantRecordNavGroup;
  readonly orgId: string;
  readonly pathname: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className={OVERLINE_CLASS}>{group.label}</div>
      {group.items.map((item) => (
        <TenantRecordNavLink
          key={item.id}
          orgId={orgId}
          item={item}
          pathname={pathname}
        />
      ))}
    </div>
  );
}

function TenantRecordFooter() {
  return (
    <div className="flex-shrink-0 border-t border-border p-2.5">
      <Link
        href={TENANT_RECORD_BACK_LINK.href}
        prefetch={false}
        className="flex min-h-[38px] items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        <span>{TENANT_RECORD_BACK_LINK.label}</span>
      </Link>
    </div>
  );
}

function TenantRecordMobileSwitcher({
  orgId,
  pathname,
  groups,
}: {
  readonly orgId: string;
  readonly pathname: string;
  readonly groups: readonly TenantRecordNavGroup[];
}) {
  const router = useRouter();
  const options = groups.flatMap((group) =>
    group.items.map((item) => ({
      value: tenantRecordItemHref(orgId, item),
      label: item.label,
      description: group.label,
    }))
  );
  const active = options.find((option) =>
    isTenantRecordHrefActive(pathname, option.value)
  );
  return (
    <div className="flex items-center gap-2 md:hidden">
      {options.length === 0 ? null : (
        <Select
          aria-label="Tenant record section"
          value={active?.value ?? ""}
          options={options}
          placeholder="Go to section"
          direction="down"
          onChange={(href) => router.push(href)}
        />
      )}
      <Link
        href={TENANT_RECORD_BACK_LINK.href}
        prefetch={false}
        aria-label={TENANT_RECORD_BACK_LINK.label}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface text-text-secondary hover:bg-surface-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <ArrowLeftIcon className="h-4 w-4" />
      </Link>
    </div>
  );
}

export function TenantRecordNav({
  orgId,
  capabilities,
}: {
  readonly orgId: string;
  readonly capabilities: readonly string[];
}) {
  const pathname = usePathname();
  const groups = visibleTenantRecordGroups(capabilities);
  return (
    <>
      <aside className="hidden w-60 flex-shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-12 flex-shrink-0 items-center border-b border-border px-3.5">
          <span className="text-xs font-bold tracking-tight text-text">
            Tenant record
          </span>
        </div>
        <nav className="flex-1 space-y-3 overflow-y-auto p-2.5" aria-label="Tenant record">
          {groups.map((group) => (
            <TenantRecordGroupBlock
              key={group.id}
              group={group}
              orgId={orgId}
              pathname={pathname}
            />
          ))}
        </nav>
        <TenantRecordFooter />
      </aside>
      <TenantRecordMobileSwitcher
        orgId={orgId}
        pathname={pathname}
        groups={groups}
      />
    </>
  );
}
