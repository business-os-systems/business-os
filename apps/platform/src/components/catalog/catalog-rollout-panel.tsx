"use client";

import { useState } from "react";
import { Button } from "@suite/ui";
import { CatalogOverrideModal } from "@/app/(platform)/apps/catalog-override-modal";
import { ConfigTable, resolveConfigTableState } from "@/components/tables/config-table";
import { APP_CATALOG_AVAILABILITY_LABELS, type CatalogApp } from "@/lib/apps-api";
import { canManageEntitlements } from "@/lib/capability";
import {
  CATALOG_ROLLOUT_TABLE_CONFIG,
  buildCatalogRolloutRows,
  summarizeCatalogRollout,
  type CatalogRolloutSummary,
} from "./catalog-rollout.config";
import { useCatalogSnapshot } from "./use-catalog-snapshot";

interface CatalogRolloutPanelProps {
  readonly app: CatalogApp;
  readonly capabilities: readonly string[];
  readonly onAppChanged: () => void;
}

interface RolloutMetricProps {
  readonly label: string;
  readonly value: string | number;
}

function RolloutMetric({ label, value }: RolloutMetricProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold text-text">{value}</dd>
    </div>
  );
}

function RolloutMetrics({
  app,
  summary,
}: {
  readonly app: CatalogApp;
  readonly summary: CatalogRolloutSummary;
}) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <RolloutMetric label="Availability" value={APP_CATALOG_AVAILABILITY_LABELS[app.availability]} />
      <RolloutMetric label="Installed tenants" value={app.installedCount} />
      <RolloutMetric label="Active items" value={summary.active} />
      <RolloutMetric label="Targeted items" value={summary.targeted} />
      <RolloutMetric label="Flag-gated items" value={summary.flagged} />
    </dl>
  );
}

function RolloutDraftBar({
  draftCount,
  canEdit,
  onEdit,
}: {
  readonly draftCount: number;
  readonly canEdit: boolean;
  readonly onEdit: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
      <p className="text-sm text-text-secondary">
        {draftCount === 0
          ? "No catalog draft is waiting for a publish."
          : draftCount + " catalog draft(s) are waiting for a previewed publish."}
      </p>
      {canEdit ? (
        <Button variant="secondary" onClick={onEdit}>
          Edit availability
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Rollout is the application's availability override plus the targeting every
 * catalog item declares. Editing the override reuses the audited catalog
 * mutation; this panel never invents a second write path (FR-001, FR-160).
 */
export function CatalogRolloutPanel({ app, capabilities, onAppChanged }: CatalogRolloutPanelProps) {
  const snapshot = useCatalogSnapshot({ appId: app.appId, enabled: true });
  const [editing, setEditing] = useState(false);
  const rows = buildCatalogRolloutRows(snapshot.items);
  const summary = summarizeCatalogRollout(snapshot.items);
  const state = resolveConfigTableState({
    isLoading: snapshot.isLoading,
    error: snapshot.error,
    rowCount: rows.length,
    errorTitle: "Unable to load catalog rollout",
  });

  return (
    <div className="max-w-full space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Rollout</h1>
        <p className="mt-1 text-sm text-text-secondary">
          The application's availability override and the plan, industry, tenant and flag
          targeting each catalog item declares.
        </p>
      </div>
      <RolloutMetrics app={app} summary={summary} />
      <RolloutDraftBar
        draftCount={summary.draft}
        canEdit={canManageEntitlements(capabilities)}
        onEdit={() => setEditing(true)}
      />
      <ConfigTable
        config={CATALOG_ROLLOUT_TABLE_CONFIG}
        rows={rows}
        state={state}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.name}
      />
      {editing ? (
        <CatalogOverrideModal
          app={app}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onAppChanged();
          }}
          onReload={onAppChanged}
        />
      ) : null}
    </div>
  );
}
