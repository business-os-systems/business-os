"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  PageExplorerTable,
  CreatePageDialog,
  type PageSummary,
  type CreatePageInput,
} from "@/components/sites";

export default function SitePagesPage() {
  const params = useParams();
  const rawSiteId = params?.["siteId"];
  const siteId = typeof rawSiteId === "string" ? rawSiteId : "";

  const [pages, setPages] = useState<PageSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPages() {
      if (!siteId) return;
      setError(null);
      try {
        const res = await fetch(`/api/cms/sites/${siteId}/pages`);
        if (res.ok) {
          const data = await res.json();
          const mapped: PageSummary[] = (data.pages || []).map((p: {
            id: string;
            siteId: string;
            title: string;
            slug: string;
            isHomePage: boolean;
            status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
            revision: number;
            updatedAt?: string;
          }) => ({
            id: p.id,
            siteId: p.siteId,
            name: p.title,
            slug: p.slug.replace(/^\//, ""),
            isHome: p.isHomePage,
            status: p.status,
            version: p.revision,
            updatedAt: p.updatedAt ? p.updatedAt.replace("T", " ").substring(0, 19) : "Just now",
          }));
          setPages(mapped);
        } else {
          setError("Failed to load pages for this site.");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load pages due to network failure.");
      } finally {
        setIsLoading(false);
      }
    }
    loadPages();
  }, [siteId]);

  const handleCreatePage = async (data: CreatePageInput) => {
    try {
      const res = await fetch(`/api/cms/sites/${siteId}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.name,
          slug: data.slug.replace(/^\//, ""),
          isHome: data.isHome,
        }),
      });

      if (res.ok) {
        const payload = await res.json();
        const created = payload.page;
        if (!created?.id) {
          setError("Malformed server response: page object missing.");
          return;
        }

        const newPage: PageSummary = {
          id: created.id,
          siteId,
          name: created.title,
          slug: created.slug.replace(/^\//, ""),
          isHome: created.isHomePage,
          status: created.status,
          version: created.revision,
          updatedAt: new Date().toISOString().replace("T", " ").substring(0, 19),
        };
        setPages((prev) => [...prev, newPage]);
        return;
      }

      const errPayload = await res.json().catch(() => ({}));
      setError(errPayload.error ?? errPayload.detail ?? "Failed to create page on server.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create page due to network error.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-xs font-medium text-text-muted">
        Loading pages...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb Header */}
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <Link href="/sites" className="hover:text-text transition-colors">
          Websites
        </Link>
        <span>/</span>
        <span className="font-mono text-text font-medium">{siteId}</span>
        <span>/</span>
        <span>Pages Explorer</span>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs font-medium">
          {error}
        </div>
      )}

      <PageExplorerTable
        siteId={siteId}
        pages={pages}
        onCreatePage={() => setIsCreateOpen(true)}
      />

      <CreatePageDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreatePage}
      />
    </div>
  );
}
