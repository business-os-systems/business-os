import type { PageAst } from "@suite/website-builder/ast";

export interface UpdateDraftContentParams {
  organizationId: string;
  pageId: string;
  expectedRevision: number;
  draftAst: Record<string, unknown>;
}

export interface UpdateDraftContentResult {
  success: boolean;
  pageId?: string;
  revision: number;
  draftAst?: Record<string, unknown>;
  errorCode?: string;
  message?: string;
}

export interface PublishPageParams {
  organizationId: string;
  pageId: string;
  expectedRevision: number;
}

export interface PublishPageResult {
  success: boolean;
  pageId?: string;
  revision: number;
  versionNumber?: number;
  errorCode?: string;
  message?: string;
}

export interface FetchPageResult {
  success: boolean;
  page?: {
    id: string;
    organizationId: string;
    siteId: string;
    name: string;
    slug: string;
    isHome: boolean;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    revision: number;
    draftAst: PageAst;
  };
  errorCode?: string;
  message?: string;
}

export interface PageVersionSnapshot {
  id: string;
  organizationId: string;
  pageId: string;
  versionNumber: number;
  label?: string | null;
  astSnapshot: Record<string, unknown>;
  createdByUserId?: string | null;
  createdAt: string;
}

export interface ListVersionsResult {
  success: boolean;
  versions: PageVersionSnapshot[];
  errorCode?: string;
  message?: string;
}

export interface ICmsApiClient {
  updateDraftContent: (params: UpdateDraftContentParams) => Promise<UpdateDraftContentResult>;
  publishPage: (params: PublishPageParams) => Promise<PublishPageResult>;
  listPageVersions?: (organizationId: string, pageId: string) => Promise<ListVersionsResult>;
}
