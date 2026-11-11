import { cn, type TableConfig, type TableEmptyStateConfig } from "@suite/ui";
import {
  CATALOG_KIND_LABELS,
  type CatalogItem,
  type CatalogItemKind,
} from "@/lib/catalog-api";
import { formatDateTime } from "@/lib/format";

/**
 * Typed presentation for the record's Activity destination. Every row is a
 * timestamp the catalog item already stores: created, draft saved, previewed or
 * published. No event is invented when a timestamp is absent (FR-001, FR-160).
 */

export const CATALOG_ACTIVITY_ACTIONS = [
  "PUBLISHED",
  "PREVIEWED",
  "DRAFT_SAVED",
  "CREATED",
] as const;

export type CatalogActivityAction = (typeof CATALOG_ACTIVITY_ACTIONS)[number];

export interface CatalogActivityEntry {
  readonly id: string;
  readonly itemId: string;
  readonly itemName: string;
  readonly kind: CatalogItemKind;
  readonly action: CatalogActivityAction;
  readonly version: number | null;
  readonly occurredAt: string;
}

export const CATALOG_ACTIVITY_LIMIT = 50;

const ACTIVITY_LABELS: Readonly<Record<CatalogActivityAction, string>> = {
  PUBLISHED: "Published",
  PREVIEWED: "Previewed",
  DRAFT_SAVED: "Draft saved",
  CREATED: "Created",
};

export function catalogActivityLabel(entry: CatalogActivityEntry): string {
  const label = ACTIVITY_LABELS[entry.action];
  if (entry.version === null) {
    return label;
  }
  return `${label} v${entry.version}`;
}

interface ActivityCandidate {
  readonly action: CatalogActivityAction;
  readonly version: number | null;
  readonly occurredAt: string;
}

function candidatesFor(item: CatalogItem): readonly ActivityCandidate[] {
  const candidates: ActivityCandidate[] = [
    { action: "CREATED", version: null, occurredAt: item.createdAt },
  ];
  if (item.draftVersion !== null) {
    candidates.push({
      action: "DRAFT_SAVED",
      version: item.draftVersion,
      occurredAt: item.updatedAt,
    });
  }
  if (item.previewedAt !== null && item.draftVersion !== null) {
    candidates.push({
      action: "PREVIEWED",
      version: item.draftVersion,
      occurredAt: item.previewedAt,
    });
  }
  if (item.currentVersion > 0 && item.publishedAt !== null) {
    candidates.push({
      action: "PUBLISHED",
      version: item.currentVersion,
      occurredAt: item.publishedAt,
    });
  }
  return candidates;
}

export function buildCatalogActivity(
  items: readonly CatalogItem[],
): readonly CatalogActivityEntry[] {
  return items
    .flatMap((item) =>
      candidatesFor(item).map((candidate) => ({
        id: `${item.id}:${candidate.action}:${candidate.version ?? "none"}`,
        itemId: item.id,
        itemName: item.name,
        kind: item.kind,
        action: candidate.action,
        version: candidate.version,
        occurredAt: candidate.occurredAt,
      })),
    )
    .sort((first, second) => {
      if (first.occurredAt !== second.occurredAt) {
        return first.occurredAt < second.occurredAt ? 1 : -1;
      }
      return first.id < second.id ? 1 : -1;
    })
    .slice(0, CATALOG_ACTIVITY_LIMIT);
}

const EMPTY_STATE: TableEmptyStateConfig = {
  title: "No catalog activity yet",
  description: "Create or publish a catalog item and its timeline appears here.",
};

function occurredColumn(): TableConfig<CatalogActivityEntry>["columns"][number] {
  return {
    key: "occurredAt",
    header: "When",
    width: "22%",
    render: (value) => (
      <span className="whitespace-nowrap text-xs text-text-secondary">
        {typeof value === "string" ? formatDateTime(value) : "-"}
      </span>
    ),
  };
}

function activityColumn(): TableConfig<CatalogActivityEntry>["columns"][number] {
  return {
    key: "action",
    header: "Activity",
    width: "24%",
    render: (_value, row) => (
      <span className="text-xs font-semibold text-text">{catalogActivityLabel(row)}</span>
    ),
  };
}

function itemColumn(): TableConfig<CatalogActivityEntry>["columns"][number] {
  return {
    key: "itemName",
    header: "Item",
    width: "34%",
    render: (value) => (
      <span className={cn("text-sm text-text")}>{typeof value === "string" ? value : "-"}</span>
    ),
  };
}

function kindColumn(): TableConfig<CatalogActivityEntry>["columns"][number] {
  return {
    key: "kind",
    header: "Kind",
    width: "20%",
    render: (_value, row) => (
      <span className="text-xs text-text-secondary">{CATALOG_KIND_LABELS[row.kind]}</span>
    ),
  };
}

export const CATALOG_ACTIVITY_TABLE_CONFIG: TableConfig<CatalogActivityEntry> = {
  id: "platform-catalog-activity",
  columns: [occurredColumn(), activityColumn(), itemColumn(), kindColumn()],
  emptyState: EMPTY_STATE,
};
