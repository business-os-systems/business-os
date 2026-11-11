import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import {
  getSite,
  listSitePages,
  type CmsPageDto,
  type CmsSiteDto,
} from "@/lib/api/site-client";
import { studioPagePath } from "./studio-links.config";

export interface StudioData {
  readonly site: CmsSiteDto | null;
  readonly pages: CmsPageDto[];
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
  readonly setPages: Dispatch<SetStateAction<CmsPageDto[]>>;
}

function findHomePage(pages: readonly CmsPageDto[]): CmsPageDto | undefined {
  return pages.find((page) => page.isHomePage);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Loads the site and tree and keeps the active page in the URL. A page that no
 * longer exists (or no history) falls back to the home page (FR-079).
 */
export function useStudioData(input: {
  readonly siteId: string;
  readonly pageId: string;
}): StudioData {
  const router = useRouter();
  const [site, setSite] = useState<CmsSiteDto | null>(null);
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
      const active = loadedPages.find((page) => page.id === input.pageId);
      if (active === undefined) {
        const home = findHomePage(loadedPages);
        if (home === undefined) {
          setError("This site has no pages yet.");
        } else {
          router.replace(studioPagePath(input.siteId, home.id));
        }
      }
    } catch (caught: unknown) {
      setError(messageOf(caught));
    } finally {
      setIsLoading(false);
    }
  }, [input.pageId, input.siteId, router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { site, pages, isLoading, error, reload, setPages };
}
