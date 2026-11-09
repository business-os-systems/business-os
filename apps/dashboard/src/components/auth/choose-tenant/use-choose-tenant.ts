"use client";

import { useCallback } from "react";
import type { TenantCardItem } from "./choose-tenant-service";
import { useTenantList } from "./use-tenant-list";
import { useTenantSwitch } from "./use-tenant-switch";

export interface ChooseTenantController {
  tenants: TenantCardItem[];
  isLoading: boolean;
  switchingId: string | null;
  errorMessage: string | null;
  reload: () => void;
  selectTenant: (organizationId: string) => void;
}

/** Composes workspace discovery and switching for the chooser page. */
export function useChooseTenant(): ChooseTenantController {
  const switching = useTenantSwitch();
  const list = useTenantList(switching.switchTenant);

  const reload = useCallback((): void => {
    switching.clearSwitchError();
    list.reload();
  }, [switching, list]);

  return {
    tenants: list.tenants,
    isLoading: list.isLoading,
    switchingId: switching.switchingId,
    errorMessage: switching.switchError ?? list.loadError,
    reload,
    selectTenant: switching.selectTenant,
  };
}
