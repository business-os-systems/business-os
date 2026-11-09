import { Button, type TableConfig } from "@suite/ui";
import type { Catalog, CatalogValue } from "@/lib/catalogs-api";
import { formatDateTime } from "@/lib/format";

export interface CatalogValueActions {
  readonly onEdit: (value: CatalogValue) => void;
  readonly onToggleStatus: (value: CatalogValue) => void;
}

const STATUS_PRESENTATION = {
  active: { label: "Active", className: "text-success" },
  retired: { label: "Retired", className: "text-text-secondary" },
} as const;

function statusPresentation(isActive: boolean) {
  return isActive ? STATUS_PRESENTATION.active : STATUS_PRESENTATION.retired;
}

function statusActionLabel(isActive: boolean): string {
  return isActive ? "Retire" : "Reactivate";
}

function StatusCell({
  value,
  actions,
}: {
  readonly value: CatalogValue;
  readonly actions: CatalogValueActions;
}) {
  const status = statusPresentation(value.isActive);
  return (
    <span className="flex items-center justify-between gap-2">
      <span className={`font-semibold ${status.className}`}>{status.label}</span>
      <Button
        variant="link"
        size="sm"
        onClick={(event) => {
          event.stopPropagation();
          actions.onToggleStatus(value);
        }}
      >
        {statusActionLabel(value.isActive)}
      </Button>
    </span>
  );
}

/**
 * The value table is one typed configuration, not hand-written columns
 * (AGENTS 5, config-based UI primacy). Status is plain bold text: colour is an
 * extra signal, never the only one (Plain-Text Table Status Law).
 */
export function createCatalogValueTableConfig(
  actions: CatalogValueActions,
): TableConfig<CatalogValue> {
  return {
    id: "platform-reference-catalog-values",
    columns: [
      {
        key: "code",
        header: "Code",
        render: (_value, row) => (
          <span className="font-mono text-xs text-text">{row.code}</span>
        ),
      },
      { key: "label", header: "Label" },
      { key: "sortOrder", header: "Order", align: "right" },
      {
        key: "isActive",
        header: "Status",
        render: (_value, row) => <StatusCell value={row} actions={actions} />,
      },
      {
        key: "updatedAt",
        header: "Updated",
        render: (value) =>
          typeof value === "string" ? (
            formatDateTime(value)
          ) : (
            <span className="text-text-muted">-</span>
          ),
      },
    ],
    emptyState: {
      title: "No values in this catalog",
      description:
        "Add the first value to make it available to every application within sixty seconds.",
    },
  };
}

/** Mirrors the API order so a local update never reshuffles the table. */
export function sortCatalogValues(
  values: readonly CatalogValue[],
): CatalogValue[] {
  return [...values].sort((first, second) => {
    if (first.sortOrder !== second.sortOrder) {
      return first.sortOrder - second.sortOrder;
    }
    const byLabel = first.label.localeCompare(second.label);
    return byLabel === 0 ? first.code.localeCompare(second.code) : byLabel;
  });
}

export function withCatalogValue(
  catalog: Catalog,
  next: CatalogValue,
): Catalog {
  const values = catalog.values.some((value) => value.code === next.code)
    ? catalog.values.map((value) => (value.code === next.code ? next : value))
    : [...catalog.values, next];
  return { ...catalog, values: sortCatalogValues(values) };
}
