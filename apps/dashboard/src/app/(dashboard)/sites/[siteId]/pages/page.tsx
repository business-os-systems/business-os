"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  PageExplorerTable,
  CreatePageDialog,
  type PageSummary,
  type CreatePageInput,
} from "@/components/sites";

const INITIAL_PAGES: PageSummary[] = [
  {
    id: "page_home_01",
    siteId: "site_riverview_main",
    name: "Homepage & Welcome Hero",
    slug: "index",
    isHome: true,
    status: "PUBLISHED",
    version: 4,
    updatedAt: "2026-10-12 11:20:00",
  },
  {
    id: "page_menu_02",
    siteId: "site_riverview_main",
    name: "Summer Tasting Menu",
    slug: "menu",
    isHome: false,
    status: "PUBLISHED",
    version: 2,
    updatedAt: "2026-10-11 14:15:00",
  },
  {
    id: "page_reservations_03",
    siteId: "site_riverview_main",
    name: "Table Reservations & VIP Booking",
    slug: "reservations",
    isHome: false,
    status: "DRAFT",
    version: 1,
    updatedAt: "2026-10-12 09:45:00",
  },
  {
    id: "page_about_04",
    siteId: "site_riverview_main",
    name: "Our Story & Culinary Philosophy",
    slug: "about",
    isHome: false,
    status: "PUBLISHED",
    version: 3,
    updatedAt: "2026-10-10 18:00:00",
  },
];

export default function SitePagesPage() {
  const params = useParams();
  const siteId = (params?.["siteId"] as string) || "site_riverview_main";

  const [pages, setPages] = useState<PageSummary[]>(INITIAL_PAGES);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const handleCreatePage = (data: CreatePageInput) => {
    const newPage: PageSummary = {
      id: `page_${Date.now()}`,
      siteId,
      name: data.name,
      slug: data.slug,
      isHome: data.isHome,
      status: "DRAFT",
      version: 1,
      updatedAt: new Date().toISOString().replace("T", " ").substring(0, 19),
    };
    setPages((prev) => [...prev, newPage]);
  };

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/sites" className="hover:text-blue-600 transition-colors">
          Websites &amp; Storefronts
        </Link>
        <span>/</span>
        <span className="font-mono text-slate-900 font-medium">{siteId}</span>
        <span>/</span>
        <span className="text-slate-900 font-semibold">Pages</span>
      </nav>

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
