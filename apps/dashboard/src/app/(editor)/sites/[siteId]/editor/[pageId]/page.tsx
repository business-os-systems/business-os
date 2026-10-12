"use client";

import React from "react";
import { useParams } from "next/navigation";
import { StudioWorkspace } from "@/components/editor";

export default function StudioEditorPage() {
  const params = useParams();
  const siteId = (params?.["siteId"] as string) || "site_riverview_main";
  const pageId = (params?.["pageId"] as string) || "page_home_01";

  return <StudioWorkspace siteId={siteId} pageId={pageId} />;
}
