import { PLATFORM_CAPABILITIES } from "@suite/core";
import {
  cn,
  type TableActionConfig,
  type TableConfig,
  type TableEmptyStateConfig,
} from "@suite/ui";
import {
  CATALOG_STATUS_LABELS,
  type CatalogItem,
  type CatalogItemKind,
  type CatalogItemStatus,
  type CatalogLifecycleAction,
} from "@/lib/catalog-api";
import { formatDateTime } from "@/lib/format";

/** Typed presentation for the three catalog panels; no screen declares columns. */

export interface CatalogPanelConfig {
  readonly title: string;
  readonly description: string;
  readonly createLabel: string;
  readonly tableId: string;
  readonly emptyState: TableEmptyStateConfig;
  readonly filteredEmptyState: TableEmptyStateConfig;
}

export const CATALOG_KIND_SEGMENTS: Readonly<Record<CatalogItemKind, string>> = {
  SECTION: "sections",
  TEMPLATE: "templates",
  THEME: "themes",
};

export function catalogStatusClassName(status: CatalogItemStatus): string {
  return STATUS_CLASS[status];
}

export const CATALOG_PANEL_CONFIGS: Readonly<Record<CatalogItemKind, CatalogPanelConfig>> = {
  SECTION: {
    title: "Sections",
    description:
      "Predefined sections every tenant of this application can place. A section reaches tenants only after a previewed version is published.",
    createLabel: "New section",
    tableId: "platform-catalog-sections",
    emptyState: {
      title: "No sections in the catalog",
      description: "Create the first section preset so tenants can compose a page.",
    },
    filteredEmptyState: {
      title: "No section with this status",
      description: "Clear the status filter or create a section here.",
    },
  },
  TEMPLATE: {
    title: "Templates",
    description:
      "Complete site templates offered at site creation. Published templates are copied into a tenant site at creation.",
    createLabel: "New template",
    tableId: "platform-catalog-templates",
    emptyState: {
      title: "No templates in the catalog",
      description: "Create the first template so tenants can start from a complete site.",
    },
    filteredEmptyState: {
      title: "No template with this status",
      description: "Clear the status filter or create a template here.",
    },
  },
  THEME: {
    title: "Themes",
    description:
      "Complete appearance presets. A site copies the token set on selection, so later theme changes never alter a published site.",
    createLabel: "New theme",
    tableId: "platform-catalog-themes",
    emptyState: {
      title: "No themes in the catalog",
      description: "Create the first theme so tenants can choose an appearance.",
    },
    filteredEmptyState: {
      title: "No theme with this status",
      description: "Clear the status filter or create a theme here.",
    },
  },
};

const STATUS_CLASS: Readonly<Record<CatalogItemStatus, string>> = {
  DRAFT: "text-text-secondary",
  ACTIVE: "text-success",
  DEPRECATED: "text-warning",
  DISABLED: "text-danger",
  RETIRED: "text-text-muted",
};

function statusColumn(): TableConfig<CatalogItem>["columns"][number] {
  return {
    key: "status",
    header: "Status",
    width: "12%",
    render: (_value, row) => (
      <span className={cn("whitespace-nowrap text-xs font-semibold", STATUS_CLASS[row.status])}>
        {CATALOG_STATUS_LABELS[row.status]}
      </span>
    ),
  };
}

function versionLabel(item: CatalogItem): string {
  if (item.draftVersion !== null) {
    return `Draft v${item.draftVersion}`;
  }
  if (item.currentVersion > 0) {
    return `v${item.currentVersion}`;
  }
  return "Unpublished";
}

function nameColumn(): TableConfig<CatalogItem>["columns"][number] {
  return {
    key: "name",
    header: "Name",
    width: "30%",
    render: (_value, row) => (
      <div className="flex flex-col">
        <span className="text-sm font-medium text-text">{row.name}</span>
        <span className="font-mono text-xs text-text-muted">{row.slug}</span>
      </div>
    ),
  };
}

function categoryColumn(): TableConfig<CatalogItem>["columns"][number] {
  return {
    key: "category",
    header: "Category",
    width: "14%",
    render: (value) => <span className="text-xs text-text-secondary">{String(value)}</span>,
  };
}

function versionColumn(): TableConfig<CatalogItem>["columns"][number] {
  return {
    key: "currentVersion",
    header: "Version",
    width: "12%",
    render: (_value, row) => (
      <span className="text-xs text-text-secondary">{versionLabel(row)}</span>
    ),
  };
}

function updatedColumn(): TableConfig<CatalogItem>["columns"][number] {
  return {
    key: "updatedAt",
    header: "Updated",
    width: "16%",
    render: (value) => (
      <span className="text-xs text-text-secondary">
        {typeof value === "string" ? formatDateTime(value) : "-"}
      </span>
    ),
  };
}

export function createCatalogTableConfig(kind: CatalogItemKind): TableConfig<CatalogItem> {
  const panel = CATALOG_PANEL_CONFIGS[kind];
  return {
    id: panel.tableId,
    columns: [nameColumn(), categoryColumn(), statusColumn(), versionColumn(), updatedColumn()],
    emptyState: panel.emptyState,
  };
}

export interface CatalogActionHandlers {
  readonly onPreview: (item: CatalogItem) => void;
  readonly onEdit: (item: CatalogItem) => void;
  readonly onTransition: (item: CatalogItem, action: CatalogLifecycleAction) => void;
}

/**
 * Row actions. Lifecycle transitions and publish require platform:apps:publish;
 * editing a draft requires platform:apps:author. Preview stays available to a
 * reviewer holding only read access (FR-074, FR-093).
 */
export function createCatalogActions(
  handlers: CatalogActionHandlers,
): readonly TableActionConfig<CatalogItem>[] {
  return [
    {
      id: "preview",
      label: "Preview",
      variant: "ghost",
      onClick: (row) => handlers.onPreview(row),
    },
    {
      id: "edit",
      label: "Edit",
      variant: "ghost",
      permission: PLATFORM_CAPABILITIES.APPS_AUTHOR.code,
      isVisible: (row) => row.status !== "RETIRED",
      onClick: (row) => handlers.onEdit(row),
    },
    {
      id: "deprecate",
      label: "Deprecate",
      variant: "ghost",
      permission: PLATFORM_CAPABILITIES.APPS_PUBLISH.code,
      isVisible: (row) => row.status === "ACTIVE",
      verification: {
        kind: "confirm",
        title: "Deprecate this catalog item?",
        message: "New sites stop being offered it. Existing tenant content keeps working.",
      },
      onClick: (row) => handlers.onTransition(row, "deprecate"),
    },
    {
      id: "disable",
      label: "Disable",
      variant: "ghost",
      permission: PLATFORM_CAPABILITIES.APPS_PUBLISH.code,
      isVisible: (row) => row.status === "ACTIVE" || row.status === "DEPRECATED",
      verification: {
        kind: "confirm",
        title: "Disable this catalog item?",
        message: "It disappears from pickers. Existing tenant content is untouched.",
      },
      onClick: (row) => handlers.onTransition(row, "disable"),
    },
    {
      id: "retire",
      label: "Retire",
      variant: "destructive",
      permission: PLATFORM_CAPABILITIES.APPS_PUBLISH.code,
      isVisible: (row) => row.status !== "RETIRED",
      verification: {
        kind: "typed",
        title: "Retire this catalog item?",
        message: "Retiring is terminal. The row is never deleted and stays resolvable.",
        expectedPhrase: (row) => row.slug,
      },
      onClick: (row) => handlers.onTransition(row, "retire"),
    },
  ];
}

