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
  const siteId = (params?.["siteId"] as string) || "";

  const [pages, setPages] = useState<PageSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    async function loadPages() {
      if (!siteId) return;
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
        }
      } catch {
        // Fallback to empty on error
      } finally {
        setIsLoading(false);
      }
    }
    loadPages();
  }, [siteId]);

  const handleCreatePage = (data: CreatePageInput) => {
    const newPage: PageSummary = {
      id: `page_${Date.now()}`,
      siteId,
      name: data.name,
      slug: data.slug.replace(/^\//, ""),
      isHome: data.isHome,
      status: "DRAFT",
      version: 1,
      updatedAt: new Date().toISOString().replace("T", " ").substring(0, 19),
    };
    setPages((prev) => [...prev, newPage]);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-xs font-medium text-slate-400">
        Loading pages...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb Header */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/sites" className="hover:text-slate-900 transition-colors">
          Websites
        </Link>
        <span>/</span>
        <span className="font-mono text-slate-900 font-medium">{siteId}</span>
        <span>/</span>
        <span>Pages Explorer</span>
      </div>

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
