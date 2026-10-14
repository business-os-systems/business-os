"use client";

import React, { useState, useEffect } from "react";
import { SiteListTable, CreateSiteDialog, type SiteSummary, type CreateSiteInput } from "@/components/sites";

export default function SitesPage() {
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Fetch real sites from database API
  useEffect(() => {
    async function loadSites() {
      try {
        const res = await fetch("/api/cms/sites");
        if (res.ok) {
          const data = await res.json();
          const mapped: SiteSummary[] = (data.sites || []).map((s: {
            id: string;
            organizationId: string;
            title: string;
            slug: string;
            status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
            pagesCount: number;
            updatedAt: string;
            primaryDomain?: string;
          }) => ({
            id: s.id,
            organizationId: s.organizationId,
            name: s.title,
            subdomain: s.slug,
            customDomain: s.primaryDomain && !s.primaryDomain.includes(".business-os.site") ? s.primaryDomain : null,
            status: s.status,
            publishedAt: s.status === "PUBLISHED" ? s.updatedAt : null,
            pagesCount: s.pagesCount || 0,
            updatedAt: s.updatedAt.replace("T", " ").substring(0, 19),
          }));
          setSites(mapped);
        }
      } catch {
        // Leave sites empty on failure
      } finally {
        setIsLoading(false);
      }
    }
    loadSites();
  }, []);

  const handleCreateSite = async (data: CreateSiteInput) => {
    try {
      const res = await fetch("/api/cms/sites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: data.name,
          slug: data.subdomain,
          brandName: data.name,
        }),
      });

      if (res.ok) {
        const resData = await res.json();
        const newSite: SiteSummary = {
          id: resData.site.id,
          organizationId: resData.site.organizationId ?? "",
          name: resData.site.title,
          subdomain: resData.site.slug,
          customDomain: null,
          status: "DRAFT",
          publishedAt: null,
          pagesCount: 1,
          updatedAt: new Date().toISOString().replace("T", " ").substring(0, 19),
        };
        setSites((prev) => [newSite, ...prev]);
      }
    } catch {
      // Ignored
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-xs font-medium text-text-muted">
        Loading websites...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SiteListTable sites={sites} onCreateSite={() => setIsCreateOpen(true)} />
      <CreateSiteDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreateSite}
      />
    </div>
  );
}
