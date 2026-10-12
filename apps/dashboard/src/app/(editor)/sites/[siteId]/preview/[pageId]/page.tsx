"use client";

import React from "react";
import { useParams } from "next/navigation";
import { PreviewWorkspace } from "@/components/preview";

export default function SitePreviewPage() {
  const params = useParams();
  const siteId = (params?.["siteId"] as string) || "site_riverview_main";
  const pageId = (params?.["pageId"] as string) || "page_home_01";

  return <PreviewWorkspace siteId={siteId} pageId={pageId} />;
}
