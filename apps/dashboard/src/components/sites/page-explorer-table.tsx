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
  "default" | "secondary" | "tertiary" | "destructive"
> = {
  PUBLISHED: "secondary",
  DRAFT: "tertiary",
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
          <h2 className="text-xl font-bold text-text tracking-tight">
            Site Pages
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Create and edit AST-driven landing pages, hero layouts, and subpaths.
          </p>
        </div>
        {onCreatePage && (
          <Button
            variant="default"
            size="sm"
            onClick={onCreatePage}
            className="gap-1.5"
          >
            <PlusIcon className="w-4 h-4" />
            New Page
          </Button>
        )}
      </div>

      {pages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-brand mb-4">
            <PlusIcon className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-bold text-text tracking-tight">No Pages Found</h3>
          <p className="mt-1.5 text-xs text-text-secondary max-w-sm mx-auto">
            This website does not have any pages created yet. Create a Home landing page or subpath to begin authoring in the Visual Studio.
          </p>
          {onCreatePage && (
            <div className="mt-6">
              <Button
                variant="default"
                size="sm"
                onClick={onCreatePage}
                className="gap-1.5"
              >
                <PlusIcon className="w-4 h-4" />
                Create First Page
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm text-text-secondary">
            <thead className="bg-surface-muted text-xs font-semibold uppercase tracking-wider text-text-secondary border-b border-border">
              <tr>
                <th className="py-3 px-4">Page Title</th>
                <th className="py-3 px-4">Route Path</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">CAS Revision</th>
                <th className="py-3 px-4">Last Modified</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pages.map((page) => (
                <tr key={page.id} className="hover:bg-surface-hover transition-colors">
                  <td className="py-3.5 px-4 font-semibold text-text">
                    <div className="flex items-center gap-2">
                      <span>{page.name}</span>
                      {page.isHome && (
                        <Badge variant="tertiary" className="text-[10px]">
                          Home
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-xs text-text">
                    {`/${page.slug}`}
                  </td>
                  <td className="py-3.5 px-4">
                    <Badge variant={PAGE_STATUS_VARIANTS[page.status]} className="font-semibold">
                      {page.status}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-4 text-xs font-mono text-text-muted">
                    {`v${page.version}`}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-text-muted">
                    {page.updatedAt}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <Link href={`/sites/${siteId}/preview/${page.id}`}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                        >
                          <EyeIcon className="w-3.5 h-3.5" />
                          Preview
                        </Button>
                      </Link>
                      <Link href={`/sites/${siteId}/editor/${page.id}`}>
                        <Button
                          variant="default"
                          size="sm"
                          className="gap-1"
                        >
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
      )}
    </div>
  );
}
