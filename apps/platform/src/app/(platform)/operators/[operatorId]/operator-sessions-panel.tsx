"use client";

import { useCallback, useState } from "react";
import { Alert, Button } from "@suite/ui";
import { createIdempotencyKey } from "@/lib/api";
import { toMessage } from "@/lib/error-message";
import {
  OPERATOR_PAGE_SIZE,
  fetchOperatorSessions,
  revokeOperatorSession,
  type OperatorSession,
} from "@/lib/operators-api";
import {
  ConfigTable,
  resolveConfigTableState,
} from "@/components/tables/config-table";
import { createOperatorSessionTableConfig } from "@/components/tables/operator-session-table.config";
import { useCursorPage } from "@/lib/use-cursor-page";

interface SessionListMutations {
  readonly setError: (message: string | null) => void;
  readonly reload: () => Promise<void>;
}

function useSessionRevoke(
  operatorId: string,
  mutations: SessionListMutations,
) {
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function revoke(session: OperatorSession): Promise<void> {
    if (revokingId !== null) {
      return;
    }
    setRevokingId(session.id);
    mutations.setError(null);
    try {
      await revokeOperatorSession({
        operatorId,
        sessionId: session.id,
        idempotencyKey: createIdempotencyKey(),
      });
      await mutations.reload();
    } catch (cause) {
      mutations.setError(toMessage(cause));
    } finally {
      setRevokingId(null);
    }
  }

  return { revoke };
}

export function OperatorSessionsPanel({ operatorId }: { readonly operatorId: string }) {
  const loadPage = useCallback(
    (cursor?: string) =>
      fetchOperatorSessions({ operatorId, cursor, limit: OPERATOR_PAGE_SIZE }),
    [operatorId],
  );
  const page = useCursorPage(loadPage);
  const { revoke } = useSessionRevoke(operatorId, page);
  const tableConfig = createOperatorSessionTableConfig({
    onRevoke: (session) => void revoke(session),
  });
  const state = resolveConfigTableState({
    isLoading: page.isLoading,
    error: page.error,
    rowCount: page.items.length,
    errorTitle: "Unable to load control sessions",
  });

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold text-text">Control sessions</h2>
        <p className="text-xs text-text-muted">
          Revoking a session ends it immediately; the operator must sign in
          again with a passkey.
        </p>
      </div>
      {page.error !== null && page.items.length > 0 ? (
        <Alert variant="error" message={page.error} />
      ) : null}
      <ConfigTable
        config={tableConfig}
        rows={page.items}
        state={state}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.id}
      />
      {page.cursor === null ? null : (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            disabled={page.isAppending}
            onClick={() => void page.loadMore()}
          >
            {page.isAppending ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </section>
  );
}
