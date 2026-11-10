"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchTenantEntitlements,
  setTenantEntitlement,
  type TenantEntitlement,
} from "@/lib/apps-api";
import { createIdempotencyKey } from "@/lib/api";
import { toMessage } from "@/lib/error-message";
import { useRequestTicket } from "@/lib/use-request-ticket";

function optimisticEntitlements(
  appIds: readonly string[],
): readonly TenantEntitlement[] {
  return appIds.map((appId) => ({
    appId,
    isEnabled: true,
    installedAt: "",
    // Until the GET resolves, the toggle is disabled because a version is
    // required for the optimistic-concurrency write.
    version: "",
    branchOverrides: [],
  }));
}

export interface TenantEntitlementsState {
  readonly apps: readonly TenantEntitlement[];
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly pendingAppId: string | null;
  readonly toggle: (app: TenantEntitlement, enabled: boolean) => Promise<void>;
}

/**
 * Renders the known installed apps immediately, then hydrates their enabled
 * state and version from the API. A failed mutation reloads the list so a
 * stale expectedVersion re-syncs instead of leaving the toggle out of step.
 */
export function useTenantEntitlements(
  orgId: string,
  initialApps: readonly string[],
): TenantEntitlementsState {
  const ticket = useRequestTicket();
  const [apps, setApps] = useState<readonly TenantEntitlement[]>(() =>
    optimisticEntitlements(initialApps),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAppId, setPendingAppId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const current = ticket.begin();
    setIsLoading(true);
    setError(null);
    try {
      const next = await fetchTenantEntitlements(orgId);
      if (ticket.isCurrent(current)) setApps(next);
    } catch (cause) {
      if (ticket.isCurrent(current)) setError(toMessage(cause));
    } finally {
      if (ticket.isCurrent(current)) setIsLoading(false);
    }
  }, [orgId, ticket]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(
    async (app: TenantEntitlement, enabled: boolean): Promise<void> => {
      if (isLoading || app.version === "") return;
      setPendingAppId(app.appId);
      setError(null);
      try {
        const next = await setTenantEntitlement({
          orgId,
          appId: app.appId,
          enabled,
          expectedVersion: app.version,
          idempotencyKey: createIdempotencyKey(),
        });
        setApps(next);
      } catch (cause) {
        const message = toMessage(cause);
        await load();
        setError(message);
      } finally {
        setPendingAppId(null);
      }
    },
    [isLoading, load, orgId],
  );

  return { apps, isLoading, error, pendingAppId, toggle };
}
