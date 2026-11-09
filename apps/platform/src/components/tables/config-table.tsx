"use client";

import {
  ConfigTableRenderer,
  type TableConfig,
  type TableEmptyStateConfig,
} from "@suite/ui";

export type ConfigTableState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly title: string; readonly message: string }
  | { readonly kind: "ready" };

export interface ConfigTableStateInput {
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly rowCount: number;
  readonly errorTitle: string;
}

/** One loading/error/ready rule for every cursor-paged table. */
export function resolveConfigTableState(
  input: ConfigTableStateInput,
): ConfigTableState {
  if (input.isLoading && input.rowCount === 0) {
    return { kind: "loading" };
  }
  if (input.error !== null && input.rowCount === 0) {
    return {
      kind: "error",
      title: input.errorTitle,
      message: input.error,
    };
  }
  return { kind: "ready" };
}

export interface ConfigTableProps<T extends object> {
  readonly config: TableConfig<T>;
  readonly rows: readonly T[];
  readonly state: ConfigTableState;
  readonly rowKey: (row: T) => string;
  readonly rowLabel: (row: T) => string;
  readonly onRowClick?: (row: T) => void;
  /** Overrides the configured empty state, for example after a filter returns nothing. */
  readonly emptyState?: TableEmptyStateConfig;
}

/**
 * Platform's table entry point. Rendering is the shared @suite/ui engine; this
 * module only maps the Platform's loading/error/ready state and row click to
 * engine props, so the two apps cannot drift into two table implementations.
 */
export function ConfigTable<T extends object>({
  config,
  rows,
  state,
  rowKey,
  rowLabel,
  onRowClick,
  emptyState,
}: ConfigTableProps<T>) {
  const errorTitle = state.kind === "error" ? state.title : undefined;
  return (
    <ConfigTableRenderer
      config={config}
      data={rows}
      rowKey={rowKey}
      rowLabel={rowLabel}
      isLoading={state.kind === "loading"}
      error={state.kind === "error" ? state.message : null}
      errorTitle={errorTitle}
      emptyState={emptyState}
      onRowOpen={onRowClick}
      nullLabel="-"
    />
  );
}
