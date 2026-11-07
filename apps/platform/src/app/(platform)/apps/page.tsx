"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfigTable } from "@/components/tables/config-table";
import {
  CATALOG_TABLE_CONFIG,
  sortCatalogApps,
} from "@/components/apps/apps.config";
import {
  CapabilityDeniedView,
  PlatformViewState,
} from "@/components/states/view-state";
import {
  toViewProblem,
  type ViewProblem,
} from "@/lib/problem-view";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import { isAbortError } from "@/lib/abort";
import { fetchAppCatalog, type CatalogApp } from "@/lib/apps-api";
import { canManageEntitlements } from "@/lib/capability";
import { CatalogOverrideModal } from "./catalog-override-modal";

function useCatalog(enabled: boolean) {
  const [apps, setApps] = useState<readonly CatalogApp[] | null>(null);
  const [problem, setProblem] = useState<ViewProblem | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setProblem(null);
    try {
      setApps(await fetchAppCatalog(signal));
    } catch (cause) {
      if (isAbortError(cause)) return;
      setProblem(toViewProblem(cause));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [enabled, load]);

  return { apps, problem, load, setApps };
}

function CatalogContent({
  apps,
  onSelect,
}: {
  readonly apps: readonly CatalogApp[];
  readonly onSelect: (app: CatalogApp) => void;
}) {
  if (apps.length === 0) {
    return (
      <PlatformViewState
        state={{
          kind: "empty",
          title: "No applications in the catalog",
          description:
            "Applications come from the compiled registry. An empty catalog means no application is registered in this build.",
        }}
      />
    );
  }
  return (
    <ConfigTable
      config={CATALOG_TABLE_CONFIG}
      rows={apps}
      state={{ kind: "ready" }}
      rowKey={(row) => row.appId}
      rowLabel={(row) => row.title}
      onRowClick={onSelect}
    />
  );
}

export default function AppCatalogPage() {
  const { session } = usePlatformAuth();
  const allowed = canManageEntitlements(session?.capabilities);
  const catalog = useCatalog(allowed);
  const [selected, setSelected] = useState<CatalogApp | null>(null);

  if (!allowed) {
    return <CapabilityDeniedView message="Your operator account cannot manage app entitlements." />;
  }
  if (catalog.problem !== null) {
    return (
      <PlatformViewState
        state={{
          kind: "error",
          problem: catalog.problem,
          onRetry: () => void catalog.load(),
        }}
      />
    );
  }
  if (catalog.apps === null) {
    return (
      <PlatformViewState state={{ kind: "loading", label: "Loading the application catalog..." }} />
    );
  }

  return (
    <div className="max-w-full space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Applications</h1>
        <p className="mt-1 text-sm text-text-secondary">
          The compiled registry and its operational overrides. Availability is presentation only:
          hiding an app never disables a tenant that already installed it.
        </p>
      </div>
      <CatalogContent apps={catalog.apps} onSelect={setSelected} />
      {selected === null ? null : (
        <CatalogOverrideModal
          app={selected}
          onClose={() => setSelected(null)}
          onReload={() => void catalog.load()}
          onSaved={(saved) => {
            catalog.setApps((current) =>
              current === null
                ? current
                : sortCatalogApps(
                    current.map((app) =>
                      app.appId === saved.appId ? saved : app,
                    ),
                  ),
            );
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
