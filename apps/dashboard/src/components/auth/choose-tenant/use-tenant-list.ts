"use client";

import { useCallback, useEffect, useState } from "react";
import { loadTenants, type TenantCardItem } from "./choose-tenant-service";

export interface TenantListState {
  tenants: TenantCardItem[];
  isLoading: boolean;
  loadError: string | null;
  reload: () => void;
}

function soleTenant(tenants: TenantCardItem[]): TenantCardItem | undefined {
  return tenants.length === 1 ? tenants[0] : undefined;
}

/**
 * Workspace discovery for the chooser. A single membership is selected
 * automatically, exactly as before, and all failures resolve into state (P12).
 */
export function useTenantList(
  onSoleTenant: (organizationId: string) => Promise<void>
): TenantListState {
  const [tenants, setTenants] = useState<TenantCardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError(null);

    const outcome = await loadTenants();
    if (outcome.kind === "failed") {
      setLoadError(outcome.message);
      setIsLoading(false);
      return;
    }

    setTenants(outcome.tenants);
    const onlyTenant = soleTenant(outcome.tenants);
    if (onlyTenant !== undefined) {
      await onSoleTenant(onlyTenant.organizationId);
    }
    setIsLoading(false);
  }, [onSoleTenant]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const reload = useCallback((): void => {
    void refresh();
  }, [refresh]);

  return { tenants, isLoading, loadError, reload };
}
