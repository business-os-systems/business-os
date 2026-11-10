"use client";

import { Alert, Button } from "@suite/ui";
import { PLATFORM_CAPABILITIES } from "@suite/core";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import {
  AUDIT_FILTERED_EMPTY_STATE,
  createAuditTableConfig,
  type AuditPayloadAccess,
} from "@/components/audit/audit-table.config";
import { ChainVerifyPanel } from "@/components/audit/chain-verify-panel";
import { CapabilityDeniedView } from "@/components/states/view-state";
import {
  ConfigTable,
  resolveConfigTableState,
} from "@/components/tables/config-table";
import type { AuditFilters } from "@/lib/audit-api";
import { hasPlatformCapability } from "@/lib/capability";
import { AuditExportAction } from "./audit-export-action";
import { AuditToolbar } from "./audit-toolbar";
import { useAudit } from "./use-audit";

function AuditHeader({
  filters,
  canReadPii,
}: {
  readonly filters: AuditFilters;
  readonly canReadPii: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">Audit trail</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">
          Search the tamper-evident platform chain. Payloads stay redacted unless
          the session holds the Read personal data capability.
        </p>
      </div>
      <AuditExportAction filters={filters} canReadPii={canReadPii} />
    </div>
  );
}

function AuditPager({
  cursor,
  isAppending,
  onLoadMore,
  onRefresh,
}: {
  readonly cursor: string | null;
  readonly isAppending: boolean;
  readonly onLoadMore: () => void;
  readonly onRefresh: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      <Button variant="ghost" disabled={isAppending} onClick={onRefresh}>
        Refresh
      </Button>
      {cursor === null ? null : (
        <Button variant="secondary" disabled={isAppending} onClick={onLoadMore}>
          {isAppending ? "Loading..." : "Load more"}
        </Button>
      )}
    </div>
  );
}

function AuditScreen({
  payloadAccess,
}: {
  readonly payloadAccess: AuditPayloadAccess;
}) {
  const audit = useAudit();
  const state = resolveConfigTableState({
    isLoading: audit.isLoading,
    error: audit.error,
    rowCount: audit.rows.length,
    errorTitle: "Unable to load audit events",
  });
  const tableConfig = createAuditTableConfig({ payloadAccess });

  return (
    <div className="max-w-full space-y-4">
      <AuditHeader
        filters={audit.filters}
        canReadPii={payloadAccess === "granted"}
      />
      <AuditToolbar
        values={audit.draft}
        isBusy={audit.isLoading}
        onFieldChange={audit.updateDraft}
        onApply={audit.applyFilters}
        onClear={audit.clearFilters}
      />
      {audit.error !== null && audit.rows.length > 0 ? (
        <Alert variant="error" message={audit.error} />
      ) : null}
      <div aria-busy={audit.isLoading}>
        <ConfigTable
          config={tableConfig}
          rows={audit.rows}
          state={state}
          rowKey={(row) => row.id}
          rowLabel={(row) => row.action}
          emptyState={audit.hasFilters ? AUDIT_FILTERED_EMPTY_STATE : undefined}
        />
      </div>
      <AuditPager
        cursor={audit.cursor}
        isAppending={audit.isAppending}
        onLoadMore={() => void audit.loadMore()}
        onRefresh={() => void audit.refresh()}
      />
      <ChainVerifyPanel
        key={audit.filters.organizationId ?? "global"}
        organizationId={audit.filters.organizationId}
      />
    </div>
  );
}

export default function AuditPage() {
  const { session } = usePlatformAuth();
  const capabilities = session?.capabilities;

  if (
    !hasPlatformCapability(
      capabilities,
      PLATFORM_CAPABILITIES.AUDIT_READ.code,
    )
  ) {
    return (
      <CapabilityDeniedView message="Your operator account cannot read the platform audit trail." />
    );
  }

  const payloadAccess: AuditPayloadAccess = hasPlatformCapability(
    capabilities,
    PLATFORM_CAPABILITIES.PII_READ.code,
  )
    ? "granted"
    : "restricted";

  return <AuditScreen payloadAccess={payloadAccess} />;
}
