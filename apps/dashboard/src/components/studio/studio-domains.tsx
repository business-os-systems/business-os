"use client";

import React from "react";
import { Badge, Button } from "@suite/ui";
import { useSiteRecord } from "./use-site-record";

export interface StudioDomainsProps {
  readonly siteId: string;
  readonly tenantRootDomain: string | null;
}

/**
 * Domains destination: the platform address this deployment issued for the
 * site, plus an honest empty state until custom-domain verification ships.
 */
export function StudioDomains({ siteId, tenantRootDomain }: StudioDomainsProps) {
  const { state, reload } = useSiteRecord(siteId);

  if (state.kind === "loading") {
    return <p className="text-xs font-medium text-text-muted">Loading domains...</p>;
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

  const platformHost =
    tenantRootDomain === null ? null : state.site.slug + "." + tenantRootDomain;

  return (
    <section aria-label="Site domains" className="max-w-3xl space-y-6">
      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Platform address
        </h2>
        {platformHost === null ? (
          <p role="alert" className="mt-2 text-sm font-medium text-danger">
            The tenant host root is not configured for this deployment, so no platform address is
            issued.
          </p>
        ) : (
          <p className="mt-2 font-mono text-sm text-text">{platformHost}</p>
        )}
      </div>
      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        <h2 className="text-sm font-semibold text-text">No custom domains are attached</h2>
        <p className="mx-auto mt-1 max-w-md text-xs text-text-secondary">
          This site is served at its platform address. Custom domain verification is not enabled
          for this workspace yet.
        </p>
        <Badge variant="tertiary" className="mt-3 text-[10px]">Platform address only</Badge>
      </div>
    </section>
  );
}
