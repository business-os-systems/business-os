"use client";

import { useState } from "react";
import { Alert, Button } from "@suite/ui";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import { CapabilityDeniedView } from "@/components/states/view-state";
import { ConfigTable, resolveConfigTableState } from "@/components/tables/config-table";
import type { CatalogItemKind } from "@/lib/catalog-api";
import { canAuthorApps, canReadApps } from "@/lib/capability";
import { CatalogEditorModal } from "./catalog-editor-modal";
import {
  CATALOG_PANEL_CONFIGS,
  createCatalogActions,
  createCatalogTableConfig,
  type CatalogPanelConfig,
} from "./catalog-list.config";
import { CatalogToolbar } from "./catalog-toolbar";
import { CATALOG_STATUS_ALL, useCatalogItems } from "./use-catalog-items";
import { useCatalogPanelActions } from "./use-catalog-panel-actions";
import type { CatalogEditorTarget } from "./use-catalog-editor";

interface CatalogPanelProps {
  readonly appId: string;
  readonly kind: CatalogItemKind;
}

function CatalogPanelIntro({ config }: { readonly config: CatalogPanelConfig }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{config.title}</h1>
      <p className="mt-1 text-sm text-text-secondary">{config.description}</p>
    </div>
  );
}

interface CatalogPanelTableProps {
  readonly kind: CatalogItemKind;
  readonly config: CatalogPanelConfig;
  readonly items: ReturnType<typeof useCatalogItems>;
  readonly actions: ReturnType<typeof createCatalogActions>;
  readonly capabilities: readonly string[];
}

function CatalogPanelTable({
  kind,
  config,
  items,
  actions,
  capabilities,
}: CatalogPanelTableProps) {
  const state = resolveConfigTableState({
    isLoading: items.isLoading,
    error: items.error,
    rowCount: items.items.length,
    errorTitle: `Unable to load catalog ${kind.toLowerCase()}s`,
  });
  const filtered = items.status !== CATALOG_STATUS_ALL;
  return (
    <>
      <ConfigTable
        config={createCatalogTableConfig(kind)}
        rows={items.items}
        state={state}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.name}
        actions={actions}
        userPermissions={capabilities}
        emptyState={filtered ? config.filteredEmptyState : undefined}
      />
      {items.cursor === null ? null : (
        <div className="flex justify-center">
          <Button variant="secondary" disabled={items.isAppending} onClick={() => void items.loadMore()}>
            {items.isAppending ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </>
  );
}

export function CatalogPanel({ appId, kind }: CatalogPanelProps) {
  const { session } = usePlatformAuth();
  const capabilities = session?.capabilities ?? [];
  const allowed = canReadApps(capabilities);
  const items = useCatalogItems({ appId, kind, enabled: allowed });
  const [target, setTarget] = useState<CatalogEditorTarget | null>(null);
  const panelActions = useCatalogPanelActions({
    appId,
    upsertItem: items.upsertItem,
    onEdit: (item) => setTarget({ mode: "edit", item }),
  });

  if (!allowed) {
    return (
      <CapabilityDeniedView message="Your operator account cannot read the application catalog." />
    );
  }

  const config = CATALOG_PANEL_CONFIGS[kind];

  return (
    <div className="max-w-full space-y-4">
      <CatalogPanelIntro config={config} />
      <CatalogToolbar
        status={items.status}
        total={items.items.length}
        isBusy={items.isLoading}
        createLabel={config.createLabel}
        canCreate={canAuthorApps(capabilities)}
        onChange={items.setStatus}
        onCreate={() => setTarget({ mode: "create", kind })}
      />
      {items.error !== null && items.items.length > 0 ? (
        <Alert variant="error" message={items.error} />
      ) : null}
      {panelActions.actionError === null ? null : (
        <Alert variant="error" message={panelActions.actionError} />
      )}
      <CatalogPanelTable
        kind={kind}
        config={config}
        items={items}
        actions={panelActions.actions}
        capabilities={capabilities}
      />
      {target === null ? null : (
        <CatalogEditorModal
          appId={appId}
          target={target}
          onClose={() => setTarget(null)}
          onSaved={(item) => {
            items.upsertItem(item);
            setTarget(null);
          }}
        />
      )}
    </div>
  );
}
