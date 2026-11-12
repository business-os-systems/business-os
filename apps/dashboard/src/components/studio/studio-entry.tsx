"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isArchivedPage, readLastEditedPage } from "@suite/website-builder/editor";
import { Button } from "@suite/ui";
import { getSite, listSitePages, type CmsPageDto } from "@/lib/api/site-client";
import { studioPagePath } from "./studio-links.config";

export interface StudioEntryProps {
  readonly siteId: string;
  readonly userId: string;
}

export function readRememberedPage(scope: {
  organizationId: string;
  userId: string;
  siteId: string;
}): string | null {
  try {
    return readLastEditedPage(scope, window.localStorage);
  } catch (error: unknown) {
    console.error("[studio] Could not read the last-edited page.", error);
    return null;
  }
}

export function resolveEntryPage(
  pages: readonly CmsPageDto[],
  lastPageId: string | null
): CmsPageDto | null {
  const remembered = pages.find(
    (page) => page.id === lastPageId && !isArchivedPage(page)
  );
  if (remembered !== undefined) {
    return remembered;
  }
  return pages.find((page) => page.isHomePage && !isArchivedPage(page)) ?? null;
}

/**
 * Resolves the page a site opens on: the user's last-edited page, then the
 * home page when the site is new, the page is archived or there is no history
 * (FR-079). Recording happens in the studio once the page actually renders.
 */
export function StudioEntry({ siteId, userId }: StudioEntryProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getSite(siteId), listSitePages(siteId)])
      .then(([site, pages]) => {
        if (cancelled) {
          return;
        }
        const lastPageId = readRememberedPage({
          organizationId: site.organizationId,
          userId,
          siteId,
        });
        const target = resolveEntryPage(pages, lastPageId);
        if (target === null) {
          setError("This site has no live pages yet.");
          return;
        }
        router.replace(studioPagePath(siteId, target.id));
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router, siteId, userId]);

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
      Opening your last edited page...
    </div>
  );
}
