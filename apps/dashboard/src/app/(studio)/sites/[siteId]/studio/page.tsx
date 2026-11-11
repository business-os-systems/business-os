"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@suite/ui";
import { listSitePages } from "@/lib/api/site-client";
import { studioPagePath } from "@/components/studio/studio-links.config";

export default function StudioHomePage() {
  const params = useParams();
  const router = useRouter();
  const rawSiteId = params.siteId;
  const siteId = typeof rawSiteId === "string" ? rawSiteId : "";
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (siteId.length === 0) {
      setError("The site address is missing.");
      return;
    }
    let cancelled = false;
    void listSitePages(siteId)
      .then((pages) => {
        if (cancelled) {
          return;
        }
        const home = pages.find((page) => page.isHomePage);
        if (home === undefined) {
          setError("This site has no home page yet.");
          return;
        }
        router.replace(studioPagePath(siteId, home.id));
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router, siteId]);

  if (error !== null) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p role="alert" className="max-w-lg text-sm font-medium text-danger">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background text-xs font-medium text-text-muted">
      Opening the home page...
    </div>
  );
}
