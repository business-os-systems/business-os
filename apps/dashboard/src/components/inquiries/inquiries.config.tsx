import React from "react";
import type { TableColumnConfig, TableConfig } from "@suite/ui";
import type { WebsiteSiteSummary } from "@/app/(dashboard)/websites/websites.contract";
import type { InquiryStatus, InquirySummary } from "./inquiries.contract";

/**
 * Declarative inquiry presentation. Status labels, table columns, filter
 * definitions and empty states live here; the workspace component owns data
 * loading only (Config-Based UI Primacy Law).
 */

interface StatusPresentation {
  readonly label: string;
  readonly className: string;
}

export const INQUIRY_STATUS_PRESENTATION = {
  NEW: { label: "New", className: "text-brand" },
  READ: { label: "Read", className: "text-text-secondary" },
  ARCHIVED: { label: "Archived", className: "text-text-muted" },
  SPAM: { label: "Spam", className: "text-danger" },
} as const satisfies Record<InquiryStatus, StatusPresentation>;

export interface InquiryStatusAction {
  readonly label: string;
  readonly status: "READ" | "ARCHIVED" | "SPAM";
  readonly variant: "primary" | "secondary" | "destructive";
}

export const INQUIRY_STATUS_ACTIONS = {
  NEW: [{ label: "Mark as read", status: "READ", variant: "primary" }],
  READ: [
    { label: "Archive", status: "ARCHIVED", variant: "secondary" },
    { label: "Mark as spam", status: "SPAM", variant: "destructive" },
  ],
  ARCHIVED: [],
  SPAM: [],
} as const satisfies Record<InquiryStatus, readonly InquiryStatusAction[]>;

export interface InquirySelectOption {
  readonly label: string;
  readonly value: string;
}

export interface InquirySelectFilter {
  readonly id: "status" | "siteId";
  readonly label: string;
  readonly allLabel: string;
  readonly options: readonly InquirySelectOption[];
}

export const INQUIRY_STATUS_FILTER_OPTIONS: readonly InquirySelectOption[] = [
  { label: "New", value: "NEW" },
  { label: "Read", value: "READ" },
  { label: "Archived", value: "ARCHIVED" },
  { label: "Spam", value: "SPAM" },
];

export function createInquiryFilters(
  sites: readonly WebsiteSiteSummary[]
): readonly InquirySelectFilter[] {
  return [
    {
      id: "status",
      label: "Status",
      allLabel: "All statuses",
      options: INQUIRY_STATUS_FILTER_OPTIONS,
    },
    {
      id: "siteId",
      label: "Website",
      allLabel: "All websites",
      options: sites.map((site) => ({ label: site.title, value: site.id })),
    },
  ];
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function formatInquiryTimestamp(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: isValidTimeZone(timeZone) ? timeZone : "UTC",
  }).format(date);
}

export interface InquiryTableConfigOptions {
  readonly sites: readonly WebsiteSiteSummary[];
  readonly onOpen: (inquiry: InquirySummary) => void;
}

function StatusCell({ status }: { readonly status: InquiryStatus }) {
  const presentation = INQUIRY_STATUS_PRESENTATION[status];
  return <span className={"text-xs font-semibold " + presentation.className}>{presentation.label}</span>;
}

function OpenCell({ inquiry, onOpen }: { readonly inquiry: InquirySummary; readonly onOpen: (inquiry: InquirySummary) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(inquiry)}
      className="inline-flex items-center rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-muted"
    >
      Open inquiry
    </button>
  );
}

export function createInquiryTableConfig({
  sites,
  onOpen,
}: InquiryTableConfigOptions): TableConfig<InquirySummary> {
  const siteName = new Map(sites.map((site) => [site.id, site.title]));
  const siteTimeZone = new Map(sites.map((site) => [site.id, site.timezone]));
  const columns: TableColumnConfig<InquirySummary>[] = [
    {
      key: "submittedAt",
      header: "Received",
      sortable: true,
      render: (_value, inquiry) => (
        <span className="text-xs text-text-muted">
          {formatInquiryTimestamp(inquiry.submittedAt, siteTimeZone.get(inquiry.siteId) ?? "UTC")}
        </span>
      ),
    },
    {
      key: "siteId",
      header: "Website",
      render: (_value, inquiry) => (
        <span className="text-xs font-medium text-text">{siteName.get(inquiry.siteId) ?? inquiry.siteId}</span>
      ),
    },
    {
      key: "preview",
      header: "Message",
      render: (value) => (
        <span className="block max-w-[28rem] truncate text-xs text-text-secondary">
          {typeof value === "string" ? value : ""}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (_value, inquiry) => <StatusCell status={inquiry.status} />,
    },
    {
      key: "id",
      header: "Detail",
      align: "right",
      render: (_value, inquiry) => <OpenCell inquiry={inquiry} onOpen={onOpen} />,
    },
  ];
  return {
    id: "website-builder-inquiries",
    columns,
    emptyState: {
      title: "No inquiries yet",
      description:
        "When a visitor submits a form on one of this workspace's published websites, the enquiry appears here.",
    },
  };
}

export const INQUIRY_DETAIL_LABELS = {
  website: "Website",
  status: "Status",
  received: "Received",
  retention: "Retention until",
  contact: "Contact details",
  fields: "Submitted fields",
  statusActions: "Status",
  name: "Name",
  email: "Email",
  phone: "Phone",
} as const;

export const INQUIRY_FILTERED_EMPTY_STATE = {
  title: "No inquiries match these filters",
  description: "Clear the website or status filter to see every enquiry in this workspace.",
} as const;
