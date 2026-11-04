"use client";

import type { ReactNode } from "react";
import {
  Alert,
  Spinner,
  cn,
  type TableColumnConfig,
  type TableConfig,
  type TableEmptyStateConfig,
} from "@suite/ui";
import { ConfigTableEmptyState } from "./config-table-empty-state";
import { RowOpenButton } from "./row-open-button";

export type ConfigTableState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly title: string; readonly message: string }
  | { readonly kind: "ready" };

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
 * Renders a typed table configuration. Presentation lives in the config module
 * so a screen never hand-writes header labels or cell markup (AGENTS 5,
 * config-based UI primacy).
 *
 * Row actions and client-side pagination are not rendered: the fleet table is
 * read-only and pages through the API cursor.
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
  if (state.kind === "loading") {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-surface p-10">
        <Spinner />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <Alert variant="error" title={state.title} message={state.message} />
    );
  }

  if (rows.length === 0) {
    return (
      <ConfigTableEmptyState emptyState={emptyState ?? config.emptyState} />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-muted">
            {config.columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={
                  column.width === undefined
                    ? undefined
                    : { width: column.width }
                }
                className={cn(
                  "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-secondary",
                  alignClass(column.align),
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={
                onRowClick === undefined ? undefined : () => onRowClick(row)
              }
              className={cn(
                "border-b border-border last:border-b-0",
                onRowClick === undefined
                  ? undefined
                  : "cursor-pointer hover:bg-surface-hover",
              )}
            >
              {config.columns.map((column, index) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-3 py-3 text-text",
                    alignClass(column.align),
                  )}
                >
                  {index === 0 && onRowClick !== undefined ? (
                    <RowOpenButton
                      rowLabel={rowLabel(row)}
                      onOpen={() => onRowClick(row)}
                    >
                      {renderCell(column, row)}
                    </RowOpenButton>
                  ) : (
                    renderCell(column, row)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function alignClass(align: "left" | "center" | "right" | undefined): string {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

function renderCell<T extends object>(
  column: TableColumnConfig<T>,
  row: T,
): ReactNode {
  const value = row[column.key];
  if (column.render !== undefined) {
    return column.render(value, row);
  }
  if (value === null || value === undefined) {
    return <span className="text-text-muted">-</span>;
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  throw new Error(
    `Table column "${column.key}" holds an object and needs a render function`,
  );
}
