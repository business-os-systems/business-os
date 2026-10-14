import React from "react";
import Link from "next/link";
import { Badge, Button } from "@suite/ui";
import { GlobeIcon, ExternalLinkIcon, PlusIcon } from "@suite/ui/icons";
import type { SiteSummary } from "./types";

interface SiteListTableProps {
  sites: SiteSummary[];
  onCreateSite?: () => void;
}

const STATUS_BADGE_VARIANTS: Record<
  SiteSummary["status"],
  "default" | "secondary" | "tertiary" | "destructive"
> = {
  PUBLISHED: "secondary",
  DRAFT: "tertiary",
  ARCHIVED: "destructive",
};

export function SiteListTable({ sites, onCreateSite }: SiteListTableProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-text tracking-tight">
            Websites &amp; Storefronts
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Manage your public domains, landing pages, and published web apps.
          </p>
        </div>
        {onCreateSite && (
          <Button variant="default" size="sm" onClick={onCreateSite} className="gap-1.5">
            <PlusIcon className="w-4 h-4" />
            New Website
          </Button>
        )}
      </div>

      {sites.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-brand mb-4">
            <GlobeIcon className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-bold text-text tracking-tight">No Websites Created Yet</h3>
          <p className="mt-1.5 text-xs text-text-secondary max-w-sm mx-auto">
            You don&apos;t have any active websites or storefronts under this organization. Launch the onboarding wizard or create a blank website to get started.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link href="/sites/onboarding">
              <Button variant="default" size="sm" className="gap-1.5">
                <PlusIcon className="w-4 h-4" />
                Launch Onboarding Wizard
              </Button>
            </Link>
            {onCreateSite && (
              <Button variant="outline" size="sm" onClick={onCreateSite}>
                Create Blank Website
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm text-text-secondary">
            <thead className="bg-surface-muted text-xs font-semibold uppercase tracking-wider text-text-secondary border-b border-border">
              <tr>
                <th className="py-3 px-4">Site Name</th>
                <th className="py-3 px-4">Domain &amp; Routing</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Pages</th>
                <th className="py-3 px-4">Last Modified</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sites.map((site) => (
                <tr key={site.id} className="hover:bg-surface-hover transition-colors">
                  <td className="py-3.5 px-4 font-semibold text-text">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-brand-tint text-brand">
                        <GlobeIcon className="w-4 h-4" />
                      </div>
                      <span>{site.name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-text">{`${site.subdomain}.business-os.site`}</span>
                      {site.customDomain && (
                        <span className="text-action text-[11px] flex items-center gap-1">
                          <ExternalLinkIcon className="w-3 h-3" />
                          {site.customDomain}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <Badge variant={STATUS_BADGE_VARIANTS[site.status]}>
                      {site.status}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-4 text-xs font-medium text-text">
                    {`${site.pagesCount} pages`}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-text-muted">
                    {site.updatedAt}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <Link href={`/sites/${site.id}/pages`}>
                      <Button variant="outline" size="sm">
                        Manage Pages
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
