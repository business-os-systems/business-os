"use client";

import React from "react";
import { Badge, Button } from "@suite/ui";
import { useSiteRecord } from "./use-site-record";

export interface StudioSiteSettingsProps {
  readonly siteId: string;
}

function formatDateTime(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(
      date
    );
  }
}

function DefinitionRow(props: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-border py-3 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs font-medium text-text-secondary">{props.label}</dt>
      <dd className="min-w-0 text-sm text-text">{props.children}</dd>
    </div>
  );
}

/** Read-only site record for the studio's Site settings destination (FR-082). */
export function StudioSiteSettings({ siteId }: StudioSiteSettingsProps) {
  const { state, reload } = useSiteRecord(siteId);

  if (state.kind === "loading") {
    return <p className="text-xs font-medium text-text-muted">Loading site settings...</p>;
  }
  if (state.kind === "error") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="max-w-xl text-sm font-medium text-danger">{state.message}</p>
        <Button type="button" variant="outline" size="sm" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }

  const { site } = state;
  return (
    <section aria-label="Site settings" className="max-w-3xl">
      <dl className="rounded-xl border border-border bg-surface px-4">
        <DefinitionRow label="Site name">{site.title}</DefinitionRow>
        <DefinitionRow label="Address">
          <span className="font-mono text-xs">{site.slug}</span>
        </DefinitionRow>
        <DefinitionRow label="Status">
          <Badge variant="tertiary" className="text-[10px]">{site.status}</Badge>
        </DefinitionRow>
        <DefinitionRow label="Pages">{String(site.pagesCount)}</DefinitionRow>
        <DefinitionRow label="Timezone">{site.timezone}</DefinitionRow>
        <DefinitionRow label="Primary locale">{site.primaryLocale}</DefinitionRow>
        <DefinitionRow label="Created">
          {formatDateTime(site.createdAt, site.timezone)}
        </DefinitionRow>
        <DefinitionRow label="Last updated">
          {formatDateTime(site.updatedAt, site.timezone)}
        </DefinitionRow>
      </dl>
      <p className="mt-4 text-xs text-text-secondary">
        Appearance, domains and redirects are separate destinations inside the studio. Editing the
        site record itself is not available in this release.
      </p>
    </section>
  );
}
