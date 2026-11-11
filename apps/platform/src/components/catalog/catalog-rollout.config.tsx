import {
  cn,
  type TableConfig,
  type TableEmptyStateConfig,
} from "@suite/ui";
import {
  CATALOG_KIND_LABELS,
  CATALOG_STATUS_LABELS,
  type CatalogItem,
  type CatalogItemKind,
  type CatalogItemStatus,
} from "@/lib/catalog-api";
import { catalogStatusClassName } from "./catalog-list.config";

/**
 * Typed presentation for the record's Rollout destination. Rollout controls are
 * the application's availability override plus the targeting each catalog item
 * declares; no screen hand-writes a column (FR-001, FR-160).
 */

export interface CatalogRolloutRow {
  readonly id: string;
  readonly name: string;
  readonly kind: CatalogItemKind;
  readonly status: CatalogItemStatus;
  readonly flagKey: string | null;
  readonly plans: readonly string[];
  readonly version: string;
}

export interface CatalogRolloutSummary {
  readonly active: number;
  readonly draft: number;
  readonly flagged: number;
  readonly targeted: number;
}

function rolloutVersion(item: CatalogItem): string {
  if (item.draftVersion !== null) {
    return `Draft v${item.draftVersion}`;
  }
  if (item.currentVersion > 0) {
    return `v${item.currentVersion}`;
  }
  return "Unpublished";
}

function isTargeted(item: CatalogItem): boolean {
  const { targeting } = item;
  return (
    targeting.plans.length > 0 ||
    targeting.industries.length > 0 ||
    targeting.orgAllowlist.length > 0 ||
    targeting.orgDenylist.length > 0
  );
}

export function buildCatalogRolloutRows(
  items: readonly CatalogItem[],
): readonly CatalogRolloutRow[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    status: item.status,
    flagKey: item.flagKey,
    plans: item.targeting.plans,
    version: rolloutVersion(item),
  }));
}

export function summarizeCatalogRollout(
  items: readonly CatalogItem[],
): CatalogRolloutSummary {
  return {
    active: items.filter((item) => item.status === "ACTIVE").length,
    draft: items.filter((item) => item.status === "DRAFT").length,
    flagged: items.filter((item) => item.flagKey !== null).length,
    targeted: items.filter(isTargeted).length,
  };
}

const EMPTY_STATE: TableEmptyStateConfig = {
  title: "No catalog items to roll out",
  description: "Publish a section, template or theme before it can reach a tenant.",
};

function nameColumn(): TableConfig<CatalogRolloutRow>["columns"][number] {
  return {
    key: "name",
    header: "Item",
    width: "32%",
    render: (_value, row) => (
      <div className="flex flex-col">
        <span className="text-sm font-medium text-text">{row.name}</span>
        <span className="font-mono text-xs text-text-muted">{row.version}</span>
      </div>
    ),
  };
}

function kindColumn(): TableConfig<CatalogRolloutRow>["columns"][number] {
  return {
    key: "kind",
    header: "Kind",
    width: "12%",
    render: (_value, row) => (
      <span className="text-xs text-text-secondary">{CATALOG_KIND_LABELS[row.kind]}</span>
    ),
  };
}

function statusColumn(): TableConfig<CatalogRolloutRow>["columns"][number] {
  return {
    key: "status",
    header: "Status",
    width: "14%",
    render: (_value, row) => (
      <span
        className={cn("whitespace-nowrap text-xs font-semibold", catalogStatusClassName(row.status))}
      >
        {CATALOG_STATUS_LABELS[row.status]}
      </span>
    ),
  };
}

function flagColumn(): TableConfig<CatalogRolloutRow>["columns"][number] {
  return {
    key: "flagKey",
    header: "Flag",
    width: "18%",
    render: (_value, row) => (
      <span className="font-mono text-xs text-text-secondary">
        {row.flagKey ?? "-"}
      </span>
    ),
  };
}

function plansColumn(): TableConfig<CatalogRolloutRow>["columns"][number] {
  return {
    key: "plans",
    header: "Plans",
    width: "24%",
    render: (_value, row) => (
      <span className="text-xs text-text-secondary">
        {row.plans.length === 0 ? "All plans" : row.plans.join(", ")}
      </span>
    ),
  };
}

export const CATALOG_ROLLOUT_TABLE_CONFIG: TableConfig<CatalogRolloutRow> = {
  id: "platform-catalog-rollout",
  columns: [nameColumn(), kindColumn(), statusColumn(), flagColumn(), plansColumn()],
  emptyState: EMPTY_STATE,
};
