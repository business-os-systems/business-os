"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { StudioWorkspace } from "@/components/editor";
import type { PageAst } from "@suite/website-builder/ast";

export default function StudioEditorPage() {
  const params = useParams();
  const rawSiteId = params?.["siteId"];
  const rawPageId = params?.["pageId"];
  const siteId = typeof rawSiteId === "string" ? rawSiteId : "";
  const pageId = typeof rawPageId === "string" ? rawPageId : "";

  const [pageData, setPageData] = useState<{
    title?: string;
    revision?: number;
    status?: "DRAFT" | "PUBLISHED";
    draftAst?: PageAst;
  } | null>(null);

  useEffect(() => {
    async function loadPage() {
      if (!pageId) return;
      try {
        const res = await fetch(`/api/cms/pages/${pageId}/content`);
        if (res.ok) {
          const data = await res.json();
          setPageData({
            title: data.title,
            revision: data.revision,
            status: data.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
            draftAst: data.draftAst,
          });
        }
      } catch {
        // Leave unpopulated
      }
    }
    loadPage();
  }, [pageId]);



  return (
    <StudioWorkspace
      siteId={siteId}
      pageId={pageId}
      pageTitle={pageData?.title}
      initialRevision={pageData?.revision}
      status={pageData?.status}
      initialAst={pageData?.draftAst}
    />
  );
}
