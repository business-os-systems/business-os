import React from "react";
import Link from "next/link";
import { Badge, Button } from "@suite/ui";
import { PlusIcon, EyeIcon, ArrowRightIcon } from "@suite/ui/icons";
import type { PageSummary } from "./types";

interface PageExplorerTableProps {
  siteId: string;
  pages: PageSummary[];
  onCreatePage?: () => void;
}

const PAGE_STATUS_VARIANTS: Record<
  PageSummary["status"],
  "default" | "secondary" | "destructive"
> = {
  PUBLISHED: "default",
  DRAFT: "secondary",
  ARCHIVED: "destructive",
};

export function PageExplorerTable({
  siteId,
  pages,
  onCreatePage,
}: PageExplorerTableProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Site Pages
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Create and edit AST-driven landing pages, hero layouts, and subpaths.
          </p>
        </div>
        {onCreatePage && (
          <Button variant="default" size="sm" onClick={onCreatePage} className="gap-1.5">
            <PlusIcon className="w-4 h-4" />
            New Page
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-200">
            <tr>
              <th className="py-3 px-4">Page Title</th>
              <th className="py-3 px-4">Route Path</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">CAS Revision</th>
              <th className="py-3 px-4">Last Modified</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pages.map((page) => (
              <tr key={page.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3.5 px-4 font-semibold text-slate-900">
                  <div className="flex items-center gap-2">
                    <span>{page.name}</span>
                    {page.isHome && (
                      <Badge variant="secondary" className="text-[10px]">
                        Home
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="py-3.5 px-4 font-mono text-xs text-slate-700">
                  {`/${page.slug}`}
                </td>
                <td className="py-3.5 px-4">
                  <Badge variant={PAGE_STATUS_VARIANTS[page.status]}>
                    {page.status}
                  </Badge>
                </td>
                <td className="py-3.5 px-4 text-xs font-mono text-slate-500">
                  {`v${page.version}`}
                </td>
                <td className="py-3.5 px-4 text-xs text-slate-500">
                  {page.updatedAt}
                </td>
                <td className="py-3.5 px-4 text-right">
                  <div className="inline-flex items-center gap-2">
                    <Link href={`/sites/${siteId}/preview/${page.id}`}>
                      <Button variant="outline" size="sm" className="gap-1">
                        <EyeIcon className="w-3.5 h-3.5" />
                        Preview
                      </Button>
                    </Link>
                    <Link href={`/sites/${siteId}/editor/${page.id}`}>
                      <Button variant="default" size="sm" className="gap-1">
                        Edit in Studio
                        <ArrowRightIcon className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
