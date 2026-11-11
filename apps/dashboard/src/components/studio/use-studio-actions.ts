import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import type {
  PageTreeCreateInput,
  PageTreeRenameInput,
} from "@suite/website-builder/editor";
import {
  createPageRequest,
  deletePageRequest,
  listSitePages,
  renamePageRequest,
  type CmsPageDto,
} from "@/lib/api/site-client";
import { studioPagePath } from "./studio-links.config";

export interface StudioActions {
  readonly selectPage: (pageId: string) => void;
  readonly createPage: (input: PageTreeCreateInput) => Promise<void>;
  readonly renamePage: (input: PageTreeRenameInput) => Promise<void>;
  readonly removePage: (pageId: string) => Promise<void>;
}

export function useStudioActions(input: {
  readonly siteId: string;
  readonly pageId: string;
  readonly setPages: Dispatch<SetStateAction<CmsPageDto[]>>;
}): StudioActions {
  const router = useRouter();
  const { pageId, setPages, siteId } = input;

  const selectPage = useCallback(
    (nextPageId: string) => {
      router.push(studioPagePath(siteId, nextPageId));
    },
    [router, siteId]
  );

  const createPage = useCallback(
    async (createInput: PageTreeCreateInput) => {
      const created = await createPageRequest(siteId, createInput);
      const refreshed = await listSitePages(siteId);
      setPages(refreshed);
      router.push(studioPagePath(siteId, created.id));
    },
    [router, setPages, siteId]
  );

  const renamePage = useCallback(
    async (renameInput: PageTreeRenameInput) => {
      const updated = await renamePageRequest(renameInput.pageId, {
        title: renameInput.title,
        path: renameInput.path,
        expectedRevision: renameInput.expectedRevision,
      });
      setPages((previous) => previous.map((page) => (page.id === updated.id ? updated : page)));
    },
    [setPages]
  );

  const removePage = useCallback(
    async (targetPageId: string) => {
      await deletePageRequest(targetPageId);
      const remaining = await listSitePages(siteId);
      setPages(remaining);
      if (targetPageId !== pageId) {
        return;
      }
      const home = remaining.find((page) => page.isHomePage);
      if (home !== undefined) {
        router.replace(studioPagePath(siteId, home.id));
      }
    },
    [pageId, router, setPages, siteId]
  );

  return { selectPage, createPage, renamePage, removePage };
}
