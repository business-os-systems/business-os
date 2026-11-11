import React from "react";
import Link from "next/link";
import type { TableColumnConfig, TableConfig } from "@suite/ui";
import { websiteBuilderStudioHref } from "@/components/layout/website-builder-nav.config";
import type {
  WebsiteSiteStatus,
  WebsiteSiteSummary,
} from "./websites.contract";

/**
 * Declarative overview table. Columns, status labels and the empty state live
 * here; the page owns data loading only.
 */

interface StatusPresentation {
  readonly label: string;
  readonly className: string;
}

const STATUS_PRESENTATION = {
  DRAFT: { label: "Draft", className: "text-text-secondary" },
  PUBLISHED: { label: "Live", className: "text-success" },
  MAINTENANCE: { label: "Maintenance", className: "text-warning" },
  SUSPENDED: { label: "Suspended", className: "text-danger" },
  ARCHIVED: { label: "Archived", className: "text-text-muted" },
} as const satisfies Record<WebsiteSiteStatus, StatusPresentation>;

function isWebsiteSiteStatus(value: unknown): value is WebsiteSiteStatus {
  return typeof value === "string" && Object.hasOwn(STATUS_PRESENTATION, value);
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function formatUpdatedAt(updatedAt: string, timeZone: string): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: zone,
  }).format(date);
}

function domainLabel(domain: string | null): string {
  if (domain === null) {
    return "Not connected";
  }
  return domain;
}

function studioPath(site: WebsiteSiteSummary): string | null {
  if (site.homePageId === null) {
    return null;
  }
  return websiteBuilderStudioHref(site.id, site.homePageId);
}

function StatusCell({ value }: { readonly value: unknown }) {
  if (!isWebsiteSiteStatus(value)) {
    return <span className="text-xs font-semibold text-text-muted">Unknown</span>;
  }
  const presentation = STATUS_PRESENTATION[value];
  return (
    <span className={`text-xs font-semibold ${presentation.className}`}>
      {presentation.label}
    </span>
  );
}

function StudioCell({ site }: { readonly site: WebsiteSiteSummary }) {
  const href = studioPath(site);
  if (href === null) {
    return <span className="text-xs font-medium text-text-muted">No home page</span>;
  }
  return (
    <Link
      href={href}
      prefetch={false}
      className="inline-flex items-center rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-muted"
    >
      Open studio
    </Link>
  );
}

const SITE_COLUMNS: TableColumnConfig<WebsiteSiteSummary>[] = [
  {
    key: "title",
    header: "Site",
    sortable: true,
    render: (_value, site) => (
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-text">{site.title}</span>
        <span className="font-mono text-[11px] text-text-muted">{site.slug}</span>
      </div>
    ),
  },
  {
    key: "primaryDomain",
    header: "Address",
    render: (_value, site) => (
      <span className="font-mono text-xs text-text-secondary">
        {domainLabel(site.primaryDomain)}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    sortable: true,
    render: (value) => <StatusCell value={value} />,
  },
  {
    key: "pageCount",
    header: "Pages",
    sortable: true,
    render: (value) => (
      <span className="text-xs font-medium text-text">
        {typeof value === "number" ? `${value} pages` : "Unknown"}
      </span>
    ),
  },
  {
    key: "updatedAt",
    header: "Last edited",
    sortable: true,
    render: (_value, site) => (
      <span className="text-xs text-text-muted">
        {formatUpdatedAt(site.updatedAt, site.timezone)}
      </span>
    ),
  },
  {
    key: "id",
    header: "Studio",
    align: "right",
    render: (_value, site) => <StudioCell site={site} />,
  },
];

export interface WebsiteTableConfigOptions {
  readonly onCreate: () => void;
}

export function createWebsiteTableConfig({
  onCreate,
}: WebsiteTableConfigOptions): TableConfig<WebsiteSiteSummary> {
  return {
    id: "website-builder-sites",
    columns: SITE_COLUMNS,
    emptyState: {
      title: "No websites yet",
      description:
        "Create your first website to start building pages in the studio.",
      actionLabel: "Create website",
      onAction: onCreate,
    },
  };
}
