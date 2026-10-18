import React, { useState, useMemo } from "react";
import {
  Button,
  Spinner,
  ChevronUpIcon,
  ChevronDownIcon,
  Card,
} from "@suite/ui";
import type {
  TableConfig,
  TableColumnConfig,
  TableActionConfig,
} from "@suite/ui";
import { hasPermission } from "@suite/core";
import { DangerZoneCard } from "../settings/danger-zone-card.js";

export interface ConfigTableRendererProps<T extends object> {
  /**
   * Strongly-typed table presentation configuration schema.
   */
  config: TableConfig<T>;
  /**
   * Array of domain entity records to display.
   */
  data: T[];
  /**
   * Whether data is currently loading.
   */
  isLoading?: boolean;
  /**
   * Explicit user capability permissions for capability-based gating.
   */
  userPermissions?: readonly string[];
  /**
   * Optional custom CSS class name for outer table wrapper.
   */
  className?: string;
}

type SortDirection = "asc" | "desc";

interface SortState<T> {
  key: keyof T & string;
  direction: SortDirection;
}

/**
 * Checks if a table action is authorized for the current user.
 */
function isActionAuthorized(
  permission?: string,
  userPermissions?: readonly string[]
): boolean {
  if (!permission) return true;
  if (!userPermissions) return true;
  return hasPermission(userPermissions, permission);
}

/**
 * ConfigTableRenderer
 *
 * Generic declarative schema-driven table engine.
 * Renders column headers, sorting triggers, empty states, and permission-gated row actions.
 */
export function ConfigTableRenderer<T extends object>({
  config,
  data,
  isLoading = false,
  userPermissions,
  className = "",
}: ConfigTableRendererProps<T>) {
  const [sortState, setSortState] = useState<SortState<T> | null>(null);
  const [dangerConfirmRow, setDangerConfirmRow] = useState<{
    row: T;
    action: TableActionConfig<T>;
  } | null>(null);

  const handleHeaderClick = (column: TableColumnConfig<T>) => {
    if (!column.sortable) return;
    setSortState((prev) => {
      if (prev?.key === column.key) {
        return {
          key: column.key,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return { key: column.key, direction: "asc" };
    });
  };

  const sortedData = useMemo(() => {
    if (!sortState) return data;
    return [...data].sort((a, b) => {
      const valA = (a as Record<string, unknown>)[sortState.key];
      const valB = (b as Record<string, unknown>)[sortState.key];
      if (valA === valB) return 0;
      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;
      const compare = String(valA).localeCompare(String(valB), undefined, {
        numeric: true,
      });
      return sortState.direction === "asc" ? compare : -compare;
    });
  }, [data, sortState]);

  const authorizedActions = useMemo(() => {
    return (config.actions || []).filter((action) =>
      isActionAuthorized(action.permission, userPermissions)
    );
  }, [config.actions, userPermissions]);

  if (isLoading) {
    return (
      <div className="flex h-48 w-full items-center justify-center rounded-xl border border-border bg-surface">
        <Spinner size="md" className="text-action" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center p-8 text-center border-border bg-surface">
        <h3 className="text-sm font-semibold text-text">{config.emptyState.title}</h3>
        <p className="mt-1 text-xs text-text-muted max-w-sm">
          {config.emptyState.description}
        </p>
        {config.emptyState.actionLabel && config.emptyState.onAction && (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={config.emptyState.onAction}
            className="mt-4 text-xs font-medium"
          >
            {config.emptyState.actionLabel}
          </Button>
        )}
      </Card>
    );
  }

  return (
    <>
      <div
        className={
          className || "w-full overflow-x-auto rounded-xl border border-border bg-surface"
        }
      >
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-muted/50 text-text-secondary font-medium">
              {config.columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  style={{ width: column.width }}
                  onClick={() => handleHeaderClick(column)}
                  className={`px-4 py-3 text-xs font-medium uppercase tracking-wider select-none ${
                    column.sortable ? "cursor-pointer hover:text-text" : ""
                  } ${
                    column.align === "right"
                      ? "text-right"
                      : column.align === "center"
                      ? "text-center"
                      : "text-left"
                  }`}
                >
                  <div
                    className={`inline-flex items-center gap-1.5 ${
                      column.align === "right" ? "justify-end" : ""
                    }`}
                  >
                    <span>{column.header}</span>
                    {column.sortable && sortState?.key === column.key && (
                      <span className="text-text-primary">
                        {sortState.direction === "asc" ? (
                          <ChevronUpIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronDownIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              {authorizedActions.length > 0 && (
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider"
                >
                  Actions
                </th>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-border/60">
            {sortedData.map((row, idx) => (
              <tr
                key={(row as { id?: string }).id ?? idx}
                className="hover:bg-surface-hover/60 transition-colors"
              >
                {config.columns.map((column) => {
                  const cellValue = (row as Record<string, unknown>)[column.key];
                  return (
                    <td
                      key={column.key}
                      className={`px-4 py-3 text-text ${
                        column.align === "right"
                          ? "text-right"
                          : column.align === "center"
                          ? "text-center"
                          : "text-left"
                      }`}
                    >
                      {column.render
                        ? column.render(cellValue, row)
                        : String(cellValue ?? "")}
                    </td>
                  );
                })}

                {authorizedActions.length > 0 && (
                  <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                    {authorizedActions.map((action) => {
                      if (action.isVisible && !action.isVisible(row)) {
                        return null;
                      }
                      const actionLabel =
                        typeof action.label === "function"
                          ? action.label(row)
                          : action.label;
                      const actionTooltip =
                        typeof action.tooltip === "function"
                          ? action.tooltip(row)
                          : action.tooltip ?? actionLabel;

                      const isIconOnly = action.iconOnly || Boolean(action.renderIcon);

                      return (
                        <Button
                          key={action.id}
                          type="button"
                          variant={action.variant ?? "outline"}
                          size="sm"
                          title={actionTooltip}
                          aria-label={actionLabel}
                          onClick={() => {
                            if (action.dangerVerificationSlug) {
                              setDangerConfirmRow({ row, action });
                            } else if (action.requiresConfirmation) {
                              const confirmed = window.confirm(
                                action.confirmationMessage ?? `Confirm ${actionLabel}?`
                              );
                              if (confirmed) {
                                void action.onClick(row);
                              }
                            } else {
                              void action.onClick(row);
                            }
                          }}
                          className={
                            isIconOnly
                              ? "h-7 w-7 p-0 inline-flex items-center justify-center text-xs"
                              : "text-xs py-1 px-2.5 h-auto font-medium"
                          }
                        >
                          {action.renderIcon ? (
                            action.renderIcon(row)
                          ) : (
                            actionLabel
                          )}
                        </Button>
                      );
                    })}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dangerConfirmRow && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim backdrop-blur-sm"
        >
          <div className="w-full max-w-lg">
            <DangerZoneCard
              title={
                dangerConfirmRow.action.confirmationTitle ??
                (typeof dangerConfirmRow.action.label === "function"
                  ? dangerConfirmRow.action.label(dangerConfirmRow.row)
                  : dangerConfirmRow.action.label)
              }
              description={
                dangerConfirmRow.action.confirmationMessage ??
                "This action requires explicit verification before proceeding."
              }
              actionLabel={
                typeof dangerConfirmRow.action.label === "function"
                  ? dangerConfirmRow.action.label(dangerConfirmRow.row)
                  : dangerConfirmRow.action.label
              }
              expectedSlug={
                dangerConfirmRow.action.dangerVerificationSlug
                  ? dangerConfirmRow.action.dangerVerificationSlug(dangerConfirmRow.row)
                  : "CONFIRM"
              }
              onConfirm={async () => {
                await dangerConfirmRow.action.onClick(dangerConfirmRow.row);
                setDangerConfirmRow(null);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
