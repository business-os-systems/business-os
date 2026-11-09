"use client";

import React, { useMemo, useState } from "react";
import { hasPermission } from "@suite/core";
import { ChevronDownIcon, ChevronUpIcon } from "../../icons/index.js";
import { cn } from "../../lib/utils.js";
import type {
  TableActionConfig,
  TableColumnConfig,
  TableConfig,
  TableEmptyStateConfig,
} from "../../types/ui-schema.js";
import { Alert } from "../alert.js";
import { Button } from "../button.js";
import { Card } from "../card.js";
import { Spinner } from "../spinner.js";
import { ConfirmActionDialog } from "./confirm-action-dialog.js";

type SortDirection = "asc" | "desc";
type Alignment = "left" | "right" | "center" | undefined;

interface SortState<T extends object> {
  readonly key: keyof T & string;
  readonly direction: SortDirection;
}

export interface ConfigTableRendererProps<T extends object> {
  readonly config: TableConfig<T>;
  readonly data: readonly T[];
  readonly rowKey?: (row: T) => string;
  readonly isLoading?: boolean;
  readonly error?: string | null;
  readonly errorTitle?: string;
  readonly nullLabel?: string;
  readonly userPermissions?: readonly string[];
  readonly className?: string;
  readonly toolbar?: React.ReactNode;
  readonly footer?: React.ReactNode;
  /** Overrides the configured empty state, e.g. after a filter returns nothing. */
  readonly emptyState?: TableEmptyStateConfig;
  readonly onRowOpen?: (row: T) => void;
  readonly rowLabel?: (row: T) => string;
}

interface PendingAction<T extends object> {
  readonly row: T;
  readonly action: TableActionConfig<T>;
  readonly expectedPhrase: string | undefined;
}

const ALIGNMENT_CLASS = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

function alignClass(alignment: Alignment): string {
  return ALIGNMENT_CLASS[alignment ?? "left"];
}

function isActionAuthorized(
  permission: string | undefined,
  userPermissions: readonly string[] | undefined,
): boolean {
  if (permission === undefined) return true;
  if (userPermissions === undefined || userPermissions.length === 0) return false;
  return hasPermission(userPermissions, permission);
}

function comparable(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return "";
}

function compareValues(
  first: unknown,
  second: unknown,
  direction: SortDirection,
): number {
  if (first === second) return 0;
  if (first === null || first === undefined) return 1;
  if (second === null || second === undefined) return -1;
  const result = comparable(first).localeCompare(comparable(second), undefined, {
    numeric: true,
  });
  return direction === "asc" ? result : -result;
}

function defaultRowKey<T extends object>(row: T): string {
  const id: unknown = "id" in row ? row.id : undefined;
  return typeof id === "string" ? id : "";
}

function resolveLabel<T>(
  label: string | ((row: T) => string),
  row: T,
): string {
  return typeof label === "function" ? label(row) : label;
}

function ariaSortFor(
  active: boolean,
  sortable: boolean,
  direction: SortDirection | undefined,
): "ascending" | "descending" | "none" | undefined {
  if (!active) return sortable ? "none" : undefined;
  return direction === "asc" ? "ascending" : "descending";
}

function useAuthorizedActions<T extends object>(
  actions: readonly TableActionConfig<T>[] | undefined,
  userPermissions: readonly string[] | undefined,
) {
  return useMemo(
    () =>
      (actions ?? []).filter((action) =>
        isActionAuthorized(action.permission, userPermissions),
      ),
    [actions, userPermissions],
  );
}

function useTableSort<T extends object>(data: readonly T[]) {
  const [sort, setSort] = useState<SortState<T> | null>(null);
  const sorted = useMemo(() => {
    if (sort === null) return data;
    return [...data].sort((first, second) =>
      compareValues(first[sort.key], second[sort.key], sort.direction),
    );
  }, [data, sort]);

  function toggle(column: TableColumnConfig<T>): void {
    if (column.sortable !== true) return;
    const key = column.key;
    setSort((previous) =>
      previous?.key === key
        ? { key, direction: previous.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  }

  return { sorted, sort, toggle };
}

function SortIndicator({
  active,
  direction,
}: {
  readonly active: boolean;
  readonly direction: SortDirection | undefined;
}) {
  if (!active) return null;
  return direction === "asc" ? (
    <ChevronUpIcon className="h-3.5 w-3.5" aria-hidden="true" />
  ) : (
    <ChevronDownIcon className="h-3.5 w-3.5" aria-hidden="true" />
  );
}

function HeaderCell<T extends object>({
  column,
  sort,
  onToggle,
}: {
  readonly column: TableColumnConfig<T>;
  readonly sort: SortState<T> | null;
  readonly onToggle: (column: TableColumnConfig<T>) => void;
}) {
  const active = sort?.key === column.key;
  const sortable = column.sortable === true;
  const direction = sort === null ? undefined : sort.direction;
  return (
    <th
      scope="col"
      aria-sort={ariaSortFor(active, sortable, direction)}
      style={column.width === undefined ? undefined : { width: column.width }}
      className={cn(
        "bg-surface px-4 py-3 text-xs font-medium uppercase tracking-wider",
        alignClass(column.align),
      )}
    >
      {sortable ? (
        <button
          type="button"
          onClick={() => onToggle(column)}
          className="inline-flex items-center gap-1.5 rounded-sm hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <span>{column.header}</span>
          <SortIndicator active={active} direction={direction} />
        </button>
      ) : (
        column.header
      )}
    </th>
  );
}

function TableHeader<T extends object>({
  columns,
  sort,
  onToggle,
  hasActions,
}: {
  readonly columns: readonly TableColumnConfig<T>[];
  readonly sort: SortState<T> | null;
  readonly onToggle: (column: TableColumnConfig<T>) => void;
  readonly hasActions: boolean;
}) {
  return (
    <thead className="sticky top-0 z-10 bg-surface">
      <tr className="border-b border-border bg-surface text-text-secondary">
        {columns.map((column) => (
          <HeaderCell
            key={column.key}
            column={column}
            sort={sort}
            onToggle={onToggle}
          />
        ))}
        {hasActions ? (
          <th
            scope="col"
            className="bg-surface px-4 py-3 text-right text-xs font-medium uppercase tracking-wider"
          >
            Actions
          </th>
        ) : null}
      </tr>
    </thead>
  );
}

function renderCell<T extends object>(
  row: T,
  column: TableColumnConfig<T>,
  nullLabel: string,
): React.ReactNode {
  const value = row[column.key];
  if (column.render !== undefined) return column.render(value, row);
  if (value === null || value === undefined) {
    return nullLabel === "" ? "" : (
      <span className="text-text-muted">{nullLabel}</span>
    );
  }
  return String(value);
}

function RowOpenCell<T extends object>({
  row,
  column,
  onRowOpen,
  label,
  nullLabel,
}: {
  readonly row: T;
  readonly column: TableColumnConfig<T>;
  readonly onRowOpen: (row: T) => void;
  readonly label: string;
  readonly nullLabel: string;
}) {
  const content = renderCell(row, column, nullLabel);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onRowOpen(row);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onRowOpen(row);
      }}
      className="rounded-sm text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <span className="sr-only">Open </span>
      {content}
      <span className="sr-only"> {label}</span>
    </button>
  );
}

function ActionCell<T extends object>({
  row,
  actions,
  onAction,
}: {
  readonly row: T;
  readonly actions: readonly TableActionConfig<T>[];
  readonly onAction: (row: T, action: TableActionConfig<T>) => void;
}) {
  const visible = actions.filter(
    (action) => action.isVisible === undefined || action.isVisible(row),
  );
  return (
    <td className="px-4 py-3 text-right">
      <span className="inline-flex items-center gap-1.5">
        {visible.map((action) => (
          <Button
            key={action.id}
            variant={action.variant === "destructive" ? "destructive" : "ghost"}
            size="sm"
            onClick={() => onAction(row, action)}
          >
            {resolveLabel(action.label, row)}
          </Button>
        ))}
      </span>
    </td>
  );
}

function TableRow<T extends object>({
  row,
  columns,
  actions,
  rowLabel,
  nullLabel,
  onRowOpen,
  onAction,
}: {
  readonly row: T;
  readonly columns: readonly TableColumnConfig<T>[];
  readonly actions: readonly TableActionConfig<T>[];
  readonly rowLabel: string;
  readonly nullLabel: string;
  readonly onRowOpen: ((row: T) => void) | undefined;
  readonly onAction: (row: T, action: TableActionConfig<T>) => void;
}) {
  return (
    <tr
      onClick={onRowOpen === undefined ? undefined : () => onRowOpen(row)}
      className={cn(
        "border-b border-border last:border-b-0",
        onRowOpen === undefined
          ? undefined
          : "cursor-pointer hover:bg-surface-hover",
      )}
    >
      {columns.map((column, index) => (
        <td
          key={column.key}
          className={cn("px-4 py-3 text-sm text-text", alignClass(column.align))}
        >
          {index === 0 && onRowOpen !== undefined ? (
            <RowOpenCell
              row={row}
              column={column}
              onRowOpen={onRowOpen}
              label={rowLabel}
              nullLabel={nullLabel}
            />
          ) : (
            renderCell(row, column, nullLabel)
          )}
        </td>
      ))}
      {actions.length === 0 ? null : (
        <ActionCell row={row} actions={actions} onAction={onAction} />
      )}
    </tr>
  );
}

function EmptyState({
  emptyState,
}: {
  readonly emptyState: TableEmptyStateConfig;
}) {
  return (
    <Card className="flex flex-col items-center justify-center border-border bg-surface p-8 text-center">
      <h3 className="text-sm font-semibold text-text">{emptyState.title}</h3>
      <p className="mt-1 max-w-sm text-xs text-text-muted">
        {emptyState.description}
      </p>
      {emptyState.actionLabel === undefined ||
      emptyState.onAction === undefined ? null : (
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={emptyState.onAction}
          className="mt-4 text-xs font-medium"
        >
          {emptyState.actionLabel}
        </Button>
      )}
    </Card>
  );
}

function TableGrid<T extends object>({
  config,
  rows,
  actions,
  rowKey,
  rowLabel,
  nullLabel,
  onRowOpen,
  onAction,
  sort,
  onToggle,
}: {
  readonly config: TableConfig<T>;
  readonly rows: readonly T[];
  readonly actions: readonly TableActionConfig<T>[];
  readonly rowKey: (row: T) => string;
  readonly rowLabel: (row: T) => string;
  readonly nullLabel: string;
  readonly onRowOpen: ((row: T) => void) | undefined;
  readonly onAction: (row: T, action: TableActionConfig<T>) => void;
  readonly sort: SortState<T> | null;
  readonly onToggle: (column: TableColumnConfig<T>) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-surface">
      <table className="w-full border-collapse text-left">
        <TableHeader
          columns={config.columns}
          sort={sort}
          onToggle={onToggle}
          hasActions={actions.length > 0}
        />
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <TableRow
                key={key}
                row={row}
                columns={config.columns}
                actions={actions}
                rowLabel={rowLabel(row)}
                nullLabel={nullLabel}
                onRowOpen={onRowOpen}
                onAction={onAction}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TableSurface<T extends object>({
  config,
  rows,
  emptyState,
  isLoading,
  error,
  errorTitle,
  nullLabel,
  actions,
  rowKey,
  rowLabel,
  onRowOpen,
  onAction,
  sort,
  onToggle,
}: {
  readonly config: TableConfig<T>;
  readonly rows: readonly T[];
  readonly emptyState: TableEmptyStateConfig;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly errorTitle: string;
  readonly nullLabel: string;
  readonly actions: readonly TableActionConfig<T>[];
  readonly rowKey: (row: T) => string;
  readonly rowLabel: (row: T) => string;
  readonly onRowOpen: ((row: T) => void) | undefined;
  readonly onAction: (row: T, action: TableActionConfig<T>) => void;
  readonly sort: SortState<T> | null;
  readonly onToggle: (column: TableColumnConfig<T>) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex h-48 w-full items-center justify-center rounded-xl border border-border bg-surface">
        <Spinner size="md" className="text-action" />
      </div>
    );
  }
  if (error !== null) {
    return <Alert variant="error" title={errorTitle} message={error} />;
  }
  if (rows.length === 0) {
    return <EmptyState emptyState={emptyState} />;
  }
  return (
    <TableGrid
      config={config}
      rows={rows}
      actions={actions}
      rowKey={rowKey}
      rowLabel={rowLabel}
      nullLabel={nullLabel}
      onRowOpen={onRowOpen}
      onAction={onAction}
      sort={sort}
      onToggle={onToggle}
    />
  );
}

function TableToolbar({
  toolbar,
}: {
  readonly toolbar: React.ReactNode | undefined;
}) {
  if (toolbar === undefined) return null;
  return (
    <div className="sticky top-0 z-20 border-b border-border bg-surface">
      {toolbar}
    </div>
  );
}

function PendingConfirmation<T extends object>({
  pending,
  onClose,
  onConfirm,
}: {
  readonly pending: PendingAction<T>;
  readonly onClose: () => void;
  readonly onConfirm: () => Promise<void>;
}) {
  return (
    <ConfirmActionDialog
      title={
        pending.action.confirmationTitle ??
        resolveLabel(pending.action.label, pending.row)
      }
      description={
        pending.action.confirmationMessage ??
        "This action requires explicit verification before proceeding."
      }
      actionLabel={resolveLabel(pending.action.label, pending.row)}
      expectedPhrase={pending.expectedPhrase}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

/**
 * One config-driven table engine for every application. Columns, sorting,
 * row actions, empty state and destructive confirmation come from the typed
 * TableConfig; the engine owns presentation only.
 */
export function ConfigTableRenderer<T extends object>({
  config,
  data,
  rowKey,
  isLoading = false,
  error = null,
  errorTitle = "Could not load this table",
  nullLabel = "",
  userPermissions,
  className,
  toolbar,
  footer,
  emptyState,
  onRowOpen,
  rowLabel,
}: ConfigTableRendererProps<T>) {
  const { sorted, sort, toggle } = useTableSort(data);
  const [pending, setPending] = useState<PendingAction<T> | null>(null);

  const actions = useAuthorizedActions(config.actions, userPermissions);

  function requestAction(row: T, action: TableActionConfig<T>): void {
    const expectedPhrase = action.dangerVerificationSlug?.(row);
    if (expectedPhrase !== undefined || action.requiresConfirmation === true) {
      setPending({ row, action, expectedPhrase });
      return;
    }
    void action.onClick(row);
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <TableToolbar toolbar={toolbar} />
      <TableSurface
        config={config}
        rows={sorted}
        emptyState={emptyState ?? config.emptyState}
        isLoading={isLoading}
        error={error}
        errorTitle={errorTitle}
        nullLabel={nullLabel}
        actions={actions}
        rowKey={rowKey ?? defaultRowKey}
        rowLabel={rowLabel ?? rowKey ?? defaultRowKey}
        onRowOpen={onRowOpen}
        onAction={requestAction}
        sort={sort}
        onToggle={toggle}
      />
      {footer}
      {pending === null ? null : (
        <PendingConfirmation
          pending={pending}
          onClose={() => setPending(null)}
          onConfirm={async () => {
            await pending.action.onClick(pending.row);
            setPending(null);
          }}
        />
      )}
    </div>
  );
}
