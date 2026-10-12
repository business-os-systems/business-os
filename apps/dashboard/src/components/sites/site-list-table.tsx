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
  "default" | "secondary" | "destructive"
> = {
  PUBLISHED: "default",
  DRAFT: "secondary",
  ARCHIVED: "destructive",
};

export function SiteListTable({ sites, onCreateSite }: SiteListTableProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Websites &amp; Storefronts
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
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

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-200">
            <tr>
              <th className="py-3 px-4">Site Name</th>
              <th className="py-3 px-4">Domain &amp; Routing</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Pages</th>
              <th className="py-3 px-4">Last Modified</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sites.map((site) => (
              <tr key={site.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3.5 px-4 font-semibold text-slate-900">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                      <GlobeIcon className="w-4 h-4" />
                    </div>
                    <span>{site.name}</span>
                  </div>
                </td>
                <td className="py-3.5 px-4 font-mono text-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-slate-800">{`${site.subdomain}.business-os.site`}</span>
                    {site.customDomain && (
                      <span className="text-blue-600 text-[11px] flex items-center gap-1">
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
                <td className="py-3.5 px-4 text-xs font-medium text-slate-700">
                  {`${site.pagesCount} pages`}
                </td>
                <td className="py-3.5 px-4 text-xs text-slate-500">
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
    </div>
  );
}
