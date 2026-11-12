import React from "react";
import type { TableColumnConfig, TableConfig } from "@suite/ui";
import {
  INQUIRY_STATUS_PRESENTATION,
  formatInquiryTimestamp,
} from "@/components/inquiries/inquiries.config";
import type { InquirySummary } from "@/components/inquiries/inquiries.contract";

/** Declarative presentation for the site-scoped inquiries destination (FR-082). */
export function createSiteInquiryTableConfig(timeZone: string): TableConfig<InquirySummary> {
  const columns: TableColumnConfig<InquirySummary>[] = [
    {
      key: "submittedAt",
      header: "Received",
      sortable: true,
      render: (value) => (
        <span className="text-xs text-text-muted">
          {typeof value === "string" ? formatInquiryTimestamp(value, timeZone) : ""}
        </span>
      ),
    },
    {
      key: "preview",
      header: "Message",
      render: (value) => (
        <span className="block max-w-[32rem] truncate text-xs text-text-secondary">
          {typeof value === "string" ? value : ""}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (_value, inquiry) => (
        <span
          className={
            "text-xs font-semibold " + INQUIRY_STATUS_PRESENTATION[inquiry.status].className
          }
        >
          {INQUIRY_STATUS_PRESENTATION[inquiry.status].label}
        </span>
      ),
    },
  ];
  return {
    id: "studio-site-inquiries",
    columns,
    emptyState: {
      title: "No enquiries yet",
      description:
        "When a visitor submits a form on this site, the enquiry appears here with its contact details kept private.",
    },
  };
}
