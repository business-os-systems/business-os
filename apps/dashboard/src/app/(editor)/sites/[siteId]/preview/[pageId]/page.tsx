"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PreviewWorkspace } from "@/components/preview";
import type { PageAst } from "@suite/website-builder/ast";

export default function SitePreviewPage() {
  const params = useParams();
  const rawSiteId = params?.["siteId"];
  const rawPageId = params?.["pageId"];
  const siteId = typeof rawSiteId === "string" ? rawSiteId : "";
  const pageId = typeof rawPageId === "string" ? rawPageId : "";

  const [pageData, setPageData] = useState<{
    title?: string;
    ast?: PageAst;
  } | null>(null);

  useEffect(() => {
    async function loadPage() {
      if (!pageId) return;
      try {
        const res = await fetch(`/api/cms/pages/${pageId}/content`);
        if (res.ok) {
          const data = await res.json();
          const astToRender = data.publishedAst ?? data.draftAst;
          setPageData({
            title: data.title,
            ast: astToRender,
          });
        }
      } catch {
        // Fall back to workspace defaults
      }
    }
    loadPage();
  }, [pageId]);

  return (
    <PreviewWorkspace
      siteId={siteId}
      pageId={pageId}
      pageTitle={pageData?.title}
      initialAst={pageData?.ast}
    />
  );
}
