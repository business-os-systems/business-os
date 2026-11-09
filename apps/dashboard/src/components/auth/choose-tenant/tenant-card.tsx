"use client";

import React from "react";
import { Button, Spinner } from "@suite/ui";
import { ChevronRightIcon } from "@suite/ui/icons";
import { TenantAvatar } from "./tenant-avatar";
import type { TenantCardItem } from "./choose-tenant-service";

function TenantCardStatus({ isPending }: { isPending: boolean }) {
  if (isPending) {
    return <Spinner size="sm" color="action" />;
  }
  return (
    <ChevronRightIcon
      size={16}
      className="text-text-muted group-hover:text-action group-hover:translate-x-0.5 transition-all"
      aria-hidden="true"
    />
  );
}

export interface TenantCardProps {
  tenant: TenantCardItem;
  isPending: boolean;
  isDisabled: boolean;
  onSelect: (organizationId: string) => void;
}

/** One selectable workspace row with avatar, metadata and pending state. */
export function TenantCard({
  tenant,
  isPending,
  isDisabled,
  onSelect,
}: TenantCardProps) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => onSelect(tenant.organizationId)}
      disabled={isDisabled}
      className="w-full h-auto text-left p-3.5 rounded-xl border border-border bg-surface hover:border-action/60 hover:bg-surface-hover active:scale-[0.99] transition-all flex items-center justify-between group disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs font-normal"
    >
      <div className="flex items-center gap-3 min-w-0">
        <TenantAvatar name={tenant.name} logoUrl={tenant.logoUrl} />
        <TenantCardMetadata tenant={tenant} />
      </div>
      <div className="shrink-0 pl-2">
        <TenantCardStatus isPending={isPending} />
      </div>
    </Button>
  );
}

function TenantCardMetadata({ tenant }: { tenant: TenantCardItem }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="font-semibold text-sm text-text truncate group-hover:text-action transition-colors">
        {tenant.name}
      </span>
      <div className="flex items-center gap-2 mt-0.5 text-xs text-text-muted">
        <span className="truncate">@{tenant.slug}</span>
        <span className="text-[10px] font-medium px-1.5 py-0.2 rounded-md bg-surface-muted border border-border text-text-secondary">
          {tenant.role}
        </span>
      </div>
    </div>
  );
}