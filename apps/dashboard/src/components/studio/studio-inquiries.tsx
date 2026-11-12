"use client";

import React from "react";
import { Button, ConfigTableRenderer } from "@suite/ui";
import { useSiteInquiries } from "./use-site-inquiries";
import { createSiteInquiryTableConfig } from "./studio-inquiries.config";
import { useSiteRecord } from "./use-site-record";

export interface StudioInquiriesProps {
  readonly siteId: string;
}

/** The site's enquiries, filtered by site id at the API boundary (FR-082). */
export function StudioInquiries({ siteId }: StudioInquiriesProps) {
  const site = useSiteRecord(siteId);
  const inquiries = useSiteInquiries(siteId);

  if (site.state.kind === "loading" || inquiries.state.kind === "loading") {
    return <p className="text-xs font-medium text-text-muted">Loading enquiries...</p>;
  }
  if (site.state.kind === "error") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="max-w-xl text-sm font-medium text-danger">
          {site.state.message}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={site.reload}>
          Try again
        </Button>
      </div>
    );
  }
  if (inquiries.state.kind === "error") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="max-w-xl text-sm font-medium text-danger">
          {inquiries.state.message}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={inquiries.reload}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <section aria-label="Site enquiries" className="max-w-4xl space-y-3">
      <p className="text-xs text-text-secondary">
        Every enquiry captured by {site.state.site.title}. Contact details stay hidden until
        revealed in the workspace Inquiries destination.
      </p>
      <ConfigTableRenderer
        config={createSiteInquiryTableConfig(site.state.site.timezone)}
        data={[...inquiries.state.items]}
        rowKey={(inquiry) => inquiry.id}
        className="rounded-xl"
      />
    </section>
  );
}
