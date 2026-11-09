"use client";

import React from "react";
import { TenantCard } from "./tenant-card";
import { ChooseTenantSkeleton } from "./choose-tenant-skeleton";
import { ChooseTenantEmpty } from "./choose-tenant-empty";
import type { ChooseTenantController } from "./use-choose-tenant";

export interface ChooseTenantListProps {
  controller: ChooseTenantController;
}

/** Selects skeleton, empty state or workspace rows for the chooser body. */
export function ChooseTenantList({ controller }: ChooseTenantListProps) {
  if (controller.isLoading) {
    return <ChooseTenantSkeleton />;
  }
  if (controller.tenants.length === 0) {
    return <ChooseTenantEmpty />;
  }

  return (
    <div className="flex flex-col gap-2.5 max-h-[320px] overflow-y-auto pr-0.5">
      {controller.tenants.map((tenant) => (
        <TenantCard
          key={tenant.organizationId}
          tenant={tenant}
          isPending={controller.switchingId === tenant.organizationId}
          isDisabled={controller.switchingId !== null}
          onSelect={controller.selectTenant}
        />
      ))}
    </div>
  );
}
