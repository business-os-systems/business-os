import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import {
  isArchivedPage,
  recordLastEditedPage,
} from "@suite/website-builder/editor";
import {
  getSite,
  listSitePages,
  listSites,
  type CmsPageDto,
  type CmsSiteDto,
} from "@/lib/api/site-client";
import { studioPagePath } from "./studio-links.config";

export interface StudioData {
  readonly site: CmsSiteDto | null;
  readonly sites: CmsSiteDto[];
  readonly pages: CmsPageDto[];
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
  readonly setPages: Dispatch<SetStateAction<CmsPageDto[]>>;
}

function findHomePage(pages: readonly CmsPageDto[]): CmsPageDto | undefined {
  return pages.find((page) => page.isHomePage && !isArchivedPage(page));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rememberLastEditedPage(
  scope: { organizationId: string; userId: string; siteId: string },
  pageId: string
): void {
  try {
    recordLastEditedPage(scope, pageId, window.localStorage);
  } catch (error: unknown) {
    // The preference is supplementary; a locked-down browser must not block
    // editing. The failure stays visible to operators instead of disappearing.
    console.error("[studio] Could not record the last-edited page.", error);
  }
}

/**
 * Loads the site, its tree and the workspace's sites for the switcher, and
 * keeps the active page in the URL. A page that no longer exists, is archived
 * or has no history falls back to the home page (FR-079, FR-084).
 */
export function useStudioData(input: {
  readonly siteId: string;
  readonly pageId: string;
  readonly userId: string;
}): StudioData {
  const router = useRouter();
  const [site, setSite] = useState<CmsSiteDto | null>(null);
  const [sites, setSites] = useState<CmsSiteDto[]>([]);
  const [pages, setPages] = useState<CmsPageDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [loadedSite, loadedPages] = await Promise.all([
        getSite(input.siteId),
        listSitePages(input.siteId),
      ]);
      setSite(loadedSite);
      setPages(loadedPages);
      try {
        const siteList = await listSites();
        setSites(siteList.items);
      } catch (switcherError: unknown) {
        // The switcher is supplementary; a failed list must not hide the page
        // the user asked to edit. The error stays visible to operators.
        console.error("[studio] Site switcher unavailable.", switcherError);
      }
      const active = loadedPages.find(
        (page) => page.id === input.pageId && !isArchivedPage(page)
      );
      if (active === undefined) {
        const home = findHomePage(loadedPages);
        if (home === undefined) {
          setError("This site has no live pages yet.");
        } else {
          router.replace(studioPagePath(input.siteId, home.id));
        }
        return;
      }
      rememberLastEditedPage(
        {
          organizationId: loadedSite.organizationId,
          userId: input.userId,
          siteId: input.siteId,
        },
        active.id
      );
    } catch (caught: unknown) {
      setError(messageOf(caught));
    } finally {
      setIsLoading(false);
    }
  }, [input.pageId, input.siteId, input.userId, router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { site, sites, pages, isLoading, error, reload, setPages };
}
