"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { requestTenantSwitchOutcome } from "./choose-tenant-service";

export interface TenantSwitchState {
  switchingId: string | null;
  switchError: string | null;
  switchTenant: (organizationId: string) => Promise<void>;
  selectTenant: (organizationId: string) => void;
  clearSwitchError: () => void;
}

/** Workspace-switch mutation and its pending/error state. */
export function useTenantSwitch(): TenantSwitchState {
  const router = useRouter();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const switchTenant = useCallback(
    async (organizationId: string): Promise<void> => {
      setSwitchingId(organizationId);
      setSwitchError(null);

      const outcome = await requestTenantSwitchOutcome(organizationId);
      if (!outcome.ok) {
        setSwitchError(outcome.errorMessage);
        setSwitchingId(null);
        return;
      }
      router.push(outcome.redirectUrl);
      router.refresh();
    },
    [router]
  );

  const selectTenant = (organizationId: string): void => {
    void switchTenant(organizationId);
  };
  const clearSwitchError = useCallback((): void => {
    setSwitchError(null);
  }, []);

  return { switchingId, switchError, switchTenant, selectTenant, clearSwitchError };
}