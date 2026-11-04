import { Badge, type TableConfig } from "@suite/ui";
import { formatDate } from "@/lib/format";
import {
  isTenantStatus,
  type TenantStatus,
  type TenantSummary,
} from "@/lib/tenant-api";

const STATUS_BADGE: Record<
  TenantStatus,
  {
    readonly variant: "success" | "secondary" | "destructive" | "tertiary";
    readonly label: string;
  }
> = {
  ACTIVE: { variant: "success", label: "Active" },
  TRIAL: { variant: "secondary", label: "Trial" },
  PAST_DUE: { variant: "destructive", label: "Past due" },
  SUSPENDED: { variant: "destructive", label: "Suspended" },
  ARCHIVED: { variant: "tertiary", label: "Archived" },
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
        const badge = STATUS_BADGE[statusOf(value)];
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
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
