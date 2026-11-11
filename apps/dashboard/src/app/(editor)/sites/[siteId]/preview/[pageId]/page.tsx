"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PreviewWorkspace } from "@/components/preview";
import { getPageContent } from "@/lib/api/cms-editor-client";
import { getSiteAppearance, listSitePages } from "@/lib/api/site-client";
import type { MediaAssetMap, PageAst } from "@suite/website-builder/ast";
import type { AppearanceTokens } from "@suite/website-builder/appearance";

export default function SitePreviewPage() {
  const params = useParams();
  const rawSiteId = params?.siteId;
  const rawPageId = params?.pageId;
  const siteId = typeof rawSiteId === "string" ? rawSiteId : "";
  const pageId = typeof rawPageId === "string" ? rawPageId : "";

  const [pageData, setPageData] = useState<{
    title?: string;
    ast?: PageAst;
    media?: MediaAssetMap;
  } | null>(null);
  const [tokens, setTokens] = useState<AppearanceTokens | null>(null);

  useEffect(() => {
    async function loadPage() {
      if (!pageId) return;
      try {
        const [content, pages] = await Promise.all([
          getPageContent(pageId),
          siteId.length === 0 ? Promise.resolve([]) : listSitePages(siteId),
        ]);
        setPageData({
          title: pages.find((page) => page.id === pageId)?.title,
          ast: content.publishedAst ?? content.draftAst,
          media: content.media,
        });
      } catch (error: unknown) {
        console.error("[cms-preview] Failed to load page content.", error);
      }
    }
    async function loadAppearance() {
      if (!siteId) return;
      try {
        const appearance = await getSiteAppearance(siteId);
        setTokens(appearance.draftTokens);
      } catch (error: unknown) {
        console.error("[cms-preview] Failed to load the site appearance.", error);
      }
    }
    void loadPage();
    void loadAppearance();
  }, [pageId, siteId]);

  return (
    <PreviewWorkspace
      siteId={siteId}
      pageId={pageId}
      pageTitle={pageData?.title}
      initialAst={pageData?.ast}
      media={pageData?.media}
      tokens={tokens}
    />
  );
}
