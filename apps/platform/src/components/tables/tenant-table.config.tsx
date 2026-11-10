import { cn, type TableConfig } from "@suite/ui";
import { formatDate } from "@/lib/format";
import {
  isTenantStatus,
  type TenantStatus,
  type TenantSummary,
} from "@/lib/tenant-api";

/**
 * Status is plain text in tables: no badge, background, border or radius.
 * The semantic text colour carries the category.
 */
const STATUS_TEXT: Record<
  TenantStatus,
  { readonly className: string; readonly label: string }
> = {
  ACTIVE: { className: "text-success", label: "Active" },
  TRIAL: { className: "text-brand", label: "Trial" },
  PAST_DUE: { className: "text-danger", label: "Past due" },
  SUSPENDED: { className: "text-danger", label: "Suspended" },
  ARCHIVED: { className: "text-text-secondary", label: "Archived" },
};

function statusOf(value: unknown): TenantStatus {
  const text = String(value);
  if (!isTenantStatus(text)) {
    throw new Error(`Unknown tenant status returned by the API: ${text}`);
  }
  return text;
}

function appIdsOf(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

export const TENANT_TABLE_CONFIG: TableConfig<TenantSummary> = {
  id: "platform-tenant-table",
  emptyState: {
    title: "No tenants yet",
    description:
      "No organization exists on the platform. Provisioning arrives with the tenant lifecycle slice.",
  },
  columns: [
    {
      key: "name",
      header: "Tenant",
      width: "32%",
      render: (_value, row) => (
        <div className="flex flex-col">
          <span className="font-medium text-text">{row.name}</span>
          <span className="text-xs text-text-muted">{row.slug}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "14%",
      render: (value) => {
        const status = STATUS_TEXT[statusOf(value)];
        return (
          <span
            className={cn(
              "whitespace-nowrap text-xs font-semibold",
              status.className
            )}
          >
            {status.label}
          </span>
        );
      },
    },
    {
      key: "branchCount",
      header: "Branches",
      align: "right",
      width: "10%",
    },
    {
      key: "memberCount",
      header: "Members",
      align: "right",
      width: "10%",
    },
    {
      key: "installedAppIds",
      header: "Apps",
      render: (value) => {
        const apps = appIdsOf(value);
        if (apps.length === 0) {
          return <span className="text-text-muted">None</span>;
        }
        return (
          <span className="text-text-secondary">{apps.length} installed</span>
        );
      },
    },
    {
      key: "quotas",
      header: "Quotas",
      align: "right",
      width: "12%",
      render: (_value, row) => {
        const { enforced, overLimit } = row.quotas;
        if (enforced === 0) {
          return <span className="text-text-muted">None</span>;
        }
        return (
          <span
            className={
              overLimit > 0
                ? "whitespace-nowrap text-xs font-semibold text-danger"
                : "whitespace-nowrap text-xs text-text-secondary"
            }
          >
            {enforced - overLimit}/{enforced} within
          </span>
        );
      },
    },
    {
      key: "createdAt",
      header: "Created",
      align: "right",
      width: "14%",
      render: (value) => (
        <span className="text-text-secondary">{formatDate(String(value))}</span>
      ),
    },
  ],
};

export const TENANT_FILTERED_EMPTY_STATE = {
  title: "No tenant matches",
  description: "Clear the search or the status filter to see the full fleet.",
} as const;
