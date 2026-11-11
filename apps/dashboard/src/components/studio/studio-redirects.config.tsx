import React from "react";
import type { TableColumnConfig, TableConfig } from "@suite/ui";
import type { CmsRedirectDto } from "@/lib/api/site-client";

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

/** Declarative presentation for the site's permanent redirects (FR-082). */
export function createRedirectTableConfig(): TableConfig<CmsRedirectDto> {
  const columns: TableColumnConfig<CmsRedirectDto>[] = [
    {
      key: "sourcePath",
      header: "Old address",
      render: (value) => (
        <span className="font-mono text-xs text-text">
          {typeof value === "string" ? value : ""}
        </span>
      ),
    },
    {
      key: "targetPath",
      header: "Redirects to",
      render: (value) => (
        <span className="font-mono text-xs text-text-secondary">
          {typeof value === "string" ? value : ""}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (value) => (
        <span className="text-xs font-semibold text-text-secondary">
          {typeof value === "string" ? value : ""}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "Created",
      sortable: true,
      render: (value) => (
        <span className="text-xs text-text-muted">
          {typeof value === "string" ? formatTimestamp(value) : ""}
        </span>
      ),
    },
  ];
  return {
    id: "studio-site-redirects",
    columns,
    emptyState: {
      title: "No redirects yet",
      description:
        "When a published page moves to a new address, its old address keeps working as a permanent redirect and appears here.",
    },
  };
}
