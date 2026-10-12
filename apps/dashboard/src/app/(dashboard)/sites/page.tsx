"use client";

import React, { useState } from "react";
import { SiteListTable, CreateSiteDialog, type SiteSummary, type CreateSiteInput } from "@/components/sites";

const INITIAL_SITES: SiteSummary[] = [
  {
    id: "site_riverview_main",
    organizationId: "org-1",
    name: "Riverview Bistro Flagship",
    subdomain: "riverview-bistro",
    customDomain: "riverviewbistro.com",
    status: "PUBLISHED",
    publishedAt: "2026-10-10 12:00:00",
    pagesCount: 4,
    updatedAt: "2026-10-12 10:15:00",
  },
  {
    id: "site_cafe_terrace",
    organizationId: "org-1",
    name: "Cafe Terrace & Wine Bar",
    subdomain: "cafe-terrace",
    customDomain: null,
    status: "DRAFT",
    publishedAt: null,
    pagesCount: 2,
    updatedAt: "2026-10-11 16:40:00",
  },
  {
    id: "site_catering_express",
    organizationId: "org-1",
    name: "Catering & Private Events",
    subdomain: "catering-express",
    customDomain: "catering.riverviewbistro.com",
    status: "PUBLISHED",
    publishedAt: "2026-10-09 09:30:00",
    pagesCount: 3,
    updatedAt: "2026-10-10 14:22:00",
  },
];

export default function SitesPage() {
  const [sites, setSites] = useState<SiteSummary[]>(INITIAL_SITES);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const handleCreateSite = (data: CreateSiteInput) => {
    const newSite: SiteSummary = {
      id: `site_${Date.now()}`,
      organizationId: "org-1",
      name: data.name,
      subdomain: data.subdomain,
      customDomain: data.customDomain || null,
      status: "DRAFT",
      pagesCount: 1,
      updatedAt: new Date().toISOString().replace("T", " ").substring(0, 19),
    };
    setSites((prev) => [newSite, ...prev]);
  };

  return (
    <div className="space-y-6">
      <SiteListTable
        sites={sites}
        onCreateSite={() => setIsCreateOpen(true)}
      />

      <CreateSiteDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreateSite}
      />
    </div>
  );
}
