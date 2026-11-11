import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import {
  isArchivedPage,
  type PageTreeCreateInput,
  type PageTreeRenameInput,
} from "@suite/website-builder/editor";
import {
  archivePageRequest,
  createPageRequest,
  duplicatePageRequest,
  listSitePages,
  renamePageRequest,
  reorderPageRequest,
  type CmsPageDto,
} from "@/lib/api/site-client";
import { studioHomePath, studioPagePath } from "./studio-links.config";

export interface StudioActions {
  readonly selectPage: (pageId: string) => void;
  readonly createPage: (input: PageTreeCreateInput) => Promise<void>;
  readonly renamePage: (input: PageTreeRenameInput) => Promise<void>;
  readonly reorderPage: (
    pageId: string,
    direction: "up" | "down",
    expectedRevision: number
  ) => Promise<void>;
  readonly duplicatePage: (pageId: string) => Promise<void>;
  readonly archivePage: (pageId: string, expectedRevision: number) => Promise<void>;
  readonly switchSite: (targetSiteId: string) => void;
}

interface PageActionInput {
  readonly siteId: string;
  readonly pageId: string;
  readonly setPages: Dispatch<SetStateAction<CmsPageDto[]>>;
}

type ReloadPages = () => Promise<CmsPageDto[]>;

function findHomePage(pages: readonly CmsPageDto[]): CmsPageDto | undefined {
  return pages.find((page) => page.isHomePage && !isArchivedPage(page));
}

function usePageCreation(input: PageActionInput, reloadPages: ReloadPages) {
  const router = useRouter();
  return useCallback(
    async (createInput: PageTreeCreateInput) => {
      const created = await createPageRequest(input.siteId, createInput);
      await reloadPages();
      router.push(studioPagePath(input.siteId, created.id));
    },
    [input.siteId, reloadPages, router]
  );
}

function usePageDuplication(input: PageActionInput, reloadPages: ReloadPages) {
  const router = useRouter();
  return useCallback(
    async (targetPageId: string) => {
      const copy = await duplicatePageRequest(targetPageId);
      await reloadPages();
      router.push(studioPagePath(input.siteId, copy.id));
    },
    [input.siteId, reloadPages, router]
  );
}

function usePageRename(input: PageActionInput) {
  const { setPages } = input;
  return useCallback(
    async (renameInput: PageTreeRenameInput) => {
      const updated = await renamePageRequest(renameInput.pageId, {
        title: renameInput.title,
        path: renameInput.path,
        expectedRevision: renameInput.expectedRevision,
      });
      setPages((previous) =>
        previous.map((page) => (page.id === updated.id ? updated : page))
      );
    },
    [setPages]
  );
}

function usePageReorder(reloadPages: ReloadPages) {
  return useCallback(
    async (targetPageId: string, direction: "up" | "down", expectedRevision: number) => {
      await reorderPageRequest(targetPageId, { direction, expectedRevision });
      await reloadPages();
    },
    [reloadPages]
  );
}

function usePageArchive(input: PageActionInput, reloadPages: ReloadPages) {
  const router = useRouter();
  return useCallback(
    async (targetPageId: string, expectedRevision: number) => {
      await archivePageRequest(targetPageId, expectedRevision);
      const remaining = await reloadPages();
      if (targetPageId !== input.pageId) {
        return;
      }
      const home = findHomePage(remaining);
      router.replace(
        home === undefined ? studioHomePath(input.siteId) : studioPagePath(input.siteId, home.id)
      );
    },
    [input.pageId, input.siteId, reloadPages, router]
  );
}

export function useStudioActions(input: PageActionInput): StudioActions {
  const router = useRouter();
  const { setPages, siteId } = input;

  const reloadPages = useCallback(async (): Promise<CmsPageDto[]> => {
    const refreshed = await listSitePages(siteId);
    setPages(refreshed);
    return refreshed;
  }, [setPages, siteId]);

  const createPage = usePageCreation(input, reloadPages);
  const duplicatePage = usePageDuplication(input, reloadPages);
  const renamePage = usePageRename(input);
  const reorderPage = usePageReorder(reloadPages);
  const archivePage = usePageArchive(input, reloadPages);

  const selectPage = useCallback(
    (nextPageId: string) => {
      router.push(studioPagePath(siteId, nextPageId));
    },
    [router, siteId]
  );

  const switchSite = useCallback(
    (targetSiteId: string) => {
      router.push(studioHomePath(targetSiteId));
    },
    [router]
  );

  return {
    selectPage,
    createPage,
    renamePage,
    reorderPage,
    duplicatePage,
    archivePage,
    switchSite,
  };
}
