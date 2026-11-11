"use client";

import React from "react";
import { useParams } from "next/navigation";
import { ReviewWorkspace } from "@/components/review";

export default function SiteReviewPage() {
  const params = useParams();
  const rawSiteId = params.siteId;
  const siteId = typeof rawSiteId === "string" ? rawSiteId : "";

  if (siteId.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6 text-center">
        <p role="alert" className="text-sm font-medium text-danger">The site address is missing.</p>
      </div>
    );
  }
  return <ReviewWorkspace siteId={siteId} />;
}
