"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TableActionConfig } from "@suite/ui";
import { ConfigTable } from "@/components/tables/config-table";
import {
  CATALOG_TABLE_CONFIG,
  catalogRowActions,
} from "@/components/apps/apps.config";
import { CapabilityDeniedView, PlatformViewState } from "@/components/states/view-state";
import { toViewProblem, type ViewProblem } from "@/lib/problem-view";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import { isAbortError } from "@/lib/abort";
import { fetchAppCatalog, type CatalogApp } from "@/lib/apps-api";
import {
  APP_RECORD_OVERVIEW_SEGMENT,
  appRecordHref,
} from "@/components/layout/app-record-nav.config";
import { canReadApps } from "@/lib/capability";
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

  return { apps, problem, load };
}

function CatalogContent({
  apps,
  onOpen,
  actions,
  userPermissions,
}: {
  readonly apps: readonly CatalogApp[];
  readonly onOpen: (app: CatalogApp) => void;
  readonly actions: readonly TableActionConfig<CatalogApp>[];
  readonly userPermissions: readonly string[];
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
      onRowClick={onOpen}
      actions={actions}
      userPermissions={userPermissions}
    />
  );
}

export default function AppCatalogPage() {
  const { session } = usePlatformAuth();
  const router = useRouter();
  const allowed = canReadApps(session?.capabilities);
  const catalog = useCatalog(allowed);
  const [selected, setSelected] = useState<CatalogApp | null>(null);

  if (!allowed) {
    return (
      <CapabilityDeniedView message="Your operator account cannot read application records." />
    );
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
          The compiled registry and its operational overrides. Open an application to manage its
          record; availability remains presentation only, because hiding an app never disables a
          tenant that already installed it.
        </p>
      </div>
      <CatalogContent
        apps={catalog.apps}
        onOpen={(app) => router.push(appRecordHref(app.appId, APP_RECORD_OVERVIEW_SEGMENT))}
        actions={catalogRowActions(setSelected)}
        userPermissions={session?.capabilities ?? []}
      />
      {selected === null ? null : (
        <CatalogOverrideModal
          app={selected}
          onClose={() => setSelected(null)}
          onReload={() => {
            setSelected(null);
            void catalog.load();
          }}
          onSaved={() => {
            setSelected(null);
            void catalog.load();
          }}
        />
      )}
    </div>
  );
}
