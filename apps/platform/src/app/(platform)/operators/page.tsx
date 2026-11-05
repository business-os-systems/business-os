"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@suite/ui";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import { OperatorCapabilityDenied } from "@/components/operators/operator-denied";
import {
  ConfigTable,
  resolveConfigTableState,
} from "@/components/tables/config-table";
import { OPERATOR_TABLE_CONFIG } from "@/components/tables/operator-table.config";
import {
  OPERATOR_PAGE_SIZE,
  canManageOperators,
  fetchOperatorPage,
} from "@/lib/operators-api";
import { useCursorPage } from "@/lib/use-cursor-page";

function useOperatorList(enabled: boolean) {
  const loadPage = useCallback(
    (cursor?: string) => fetchOperatorPage({ cursor, limit: OPERATOR_PAGE_SIZE }),
    [],
  );
  return useCursorPage(loadPage, enabled);
}

export default function OperatorsPage() {
  const router = useRouter();
  const { session } = usePlatformAuth();
  const allowed = canManageOperators(session?.capabilities);
  const list = useOperatorList(allowed);

  if (!allowed) {
    return <OperatorCapabilityDenied />;
  }

  const state = resolveConfigTableState({
    isLoading: list.isLoading,
    error: list.error,
    rowCount: list.items.length,
    errorTitle: "Unable to load operators",
  });

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Operators</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Every platform operator, their sign-in state and the capabilities they
          hold. Open a record to change status or edit capabilities; every change
          is audited.
        </p>
      </div>

      {list.error !== null && list.items.length > 0 ? (
        <Alert variant="error" message={list.error} />
      ) : null}

      <ConfigTable
        config={OPERATOR_TABLE_CONFIG}
        rows={list.items}
        state={state}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.displayName}
        onRowClick={(row) => {
          router.push(`/operators/${encodeURIComponent(row.id)}`);
        }}
      />

      {list.cursor === null ? null : (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            disabled={list.isAppending}
            onClick={() => void list.loadMore()}
          >
            {list.isAppending ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
