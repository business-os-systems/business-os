"use client";

import { useState } from "react";
import { Alert, Button } from "@suite/ui";
import { PLATFORM_CAPABILITIES } from "@suite/core";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import { hasPlatformCapability } from "@/lib/capability";
import { ConfigTable, type ConfigTableState } from "@/components/tables/config-table";
import {
  FLAG_FILTERED_EMPTY_STATE,
  createFlagsTableConfig,
} from "@/components/flags/flags-table.config";
import { FlagCreateModal } from "@/components/flags/flag-create-modal";
import { FlagLifecycleModal } from "@/components/flags/flag-lifecycle-modal";
import { FlagRulesModal } from "@/components/flags/flag-rules-modal";
import type { FlagRecord } from "@/lib/flags-api";
import { ENVIRONMENT_ALL } from "./use-flags";
import { useFlags } from "./use-flags";
import { FlagsToolbar } from "./flags-toolbar";

interface FlagTableStateInput {
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly rowCount: number;
}

function resolveTableState(input: FlagTableStateInput): ConfigTableState {
  if (input.isLoading && input.rowCount === 0) {
    return { kind: "loading" };
  }
  if (input.error !== null && input.rowCount === 0) {
    return { kind: "error", title: "Unable to load flags", message: input.error };
  }
  return { kind: "ready" };
}

export default function FlagsPage() {
  const { session } = usePlatformAuth();
  const flags = useFlags();
  const [createOpen, setCreateOpen] = useState(false);
  const [rulesFlag, setRulesFlag] = useState<FlagRecord | null>(null);
  const [editFlag, setEditFlag] = useState<FlagRecord | null>(null);
  const allowed = hasPlatformCapability(
    session?.capabilities,
    PLATFORM_CAPABILITIES.FLAGS_MANAGE.code
  );

  if (!allowed) {
    return (
      <Alert
        variant="error"
        title="Capability denied"
        message="Your operator account cannot manage feature flags."
      />
    );
  }

  const state = resolveTableState({
    isLoading: flags.isLoading,
    error: flags.error,
    rowCount: flags.rows.length,
  });

  const tableConfig = createFlagsTableConfig({
    onToggle: (flag) => void flags.toggle(flag),
    onRules: setRulesFlag,
    onEdit: setEditFlag,
  });
  const isFiltered = flags.environment !== ENVIRONMENT_ALL;

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Feature flags</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Gate any app feature with a namespaced key such as{" "}
          <span className="font-mono text-xs text-text">pos.offline_mode</span>.
          Flags start off, expire automatically and carry an owner and a removal
          ticket.
        </p>
      </div>

      <FlagsToolbar
        environment={flags.environment}
        total={flags.rows.length}
        isBusy={flags.isLoading}
        onChange={flags.setEnvironment}
        onCreate={() => setCreateOpen(true)}
      />

      {flags.error !== null && flags.rows.length > 0 ? (
        <Alert variant="error" message={flags.error} />
      ) : null}

      <ConfigTable
        config={tableConfig}
        rows={flags.rows}
        state={state}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.key}
        emptyState={isFiltered ? FLAG_FILTERED_EMPTY_STATE : undefined}
      />

      {flags.cursor !== null ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            disabled={flags.isAppending}
            onClick={() => void flags.loadMore()}
          >
            {flags.isAppending ? "Loading..." : "Load more"}
          </Button>
        </div>
      ) : null}

      {createOpen ? (
        <FlagCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void flags.refresh();
          }}
        />
      ) : null}

      {rulesFlag !== null ? (
        <FlagRulesModal
          flag={rulesFlag}
          onClose={() => setRulesFlag(null)}
          onSaved={(flag) => {
            flags.replaceFlag(flag);
            setRulesFlag(null);
          }}
        />
      ) : null}

      {editFlag !== null ? (
        <FlagLifecycleModal
          flag={editFlag}
          onClose={() => setEditFlag(null)}
          onSaved={(flag) => {
            flags.replaceFlag(flag);
            setEditFlag(null);
          }}
        />
      ) : null}
    </div>
  );
}
