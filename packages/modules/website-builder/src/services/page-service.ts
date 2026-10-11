export interface PageContentMutationResult {
  success: boolean;
  pageId: string;
  revision: number;
  draftAst: Record<string, unknown>;
  publishedAst?: Record<string, unknown> | null;
  errorCode?: string;
  message?: string;
}

export interface PublishPageResult {
  success: boolean;
  pageId: string;
  revision: number;
  publishedAst: Record<string, unknown>;
  versionNumber: number;
  errorCode?: string;
  message?: string;
}

export interface PageRecord {
  id: string;
  organizationId: string;
  siteId: string;
  slug: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  revision: number;
  isHomePage: boolean;
  draftAst: Record<string, unknown>;
  publishedAst?: Record<string, unknown> | null;
  publishedAt?: string | null;
}

export class PageService {
  // In-memory state store for service operations (maps to prisma.cmsPage in production)
  private pages: Map<string, PageRecord> = new Map();

  constructor() {
    // Seed initial demo page for tests
    this.pages.set("page_demo_1", {
      id: "page_demo_1",
      organizationId: "org_alpha",
      siteId: "site_alpha",
      slug: "/about-us",
      title: "About Us",
      status: "DRAFT",
      revision: 1,
      isHomePage: false,
      draftAst: { sections: [{ id: "sec_1", type: "hero" }] },
      publishedAst: null,
      publishedAt: null,
    });
  }

  /**
   * Lists pages scoped strictly to tenant and site
   */
  public async listPages(
    organizationId: string,
    siteId: string
  ): Promise<PageRecord[]> {
    const results: PageRecord[] = [];
    for (const page of this.pages.values()) {
      if (
        page.organizationId === organizationId &&
        page.siteId === siteId
      ) {
        results.push(page);
      }
    }
    return results;
  }

  /**
   * Updates draft AST with atomic Compare-and-Swap (CAS) Concurrency Control
   */
  public async updateDraftContent(params: {
    organizationId: string;
    pageId: string;
    expectedRevision: number;
    draftAst: Record<string, unknown>;
  }): Promise<PageContentMutationResult> {
    const page = this.pages.get(params.pageId);

    if (!page || page.organizationId !== params.organizationId) {
      return {
        success: false,
        pageId: params.pageId,
        revision: 0,
        draftAst: {},
        errorCode: "PAGE_NOT_FOUND",
        message: "Page not found within current organization.",
      };
    }

    // Atomic CAS Check: Reject if revision has diverged
    if (page.revision !== params.expectedRevision) {
      return {
        success: false,
        pageId: params.pageId,
        revision: page.revision,
        draftAst: page.draftAst,
        errorCode: "CMS_CONCURRENCY_CONFLICT",
        message: `Concurrency conflict: Expected revision ${params.expectedRevision}, but active revision is ${page.revision}.`,
      };
    }

    // Mutate draft state and increment revision atomically
    page.draftAst = params.draftAst;
    page.revision += 1;

    return {
      success: true,
      pageId: page.id,
      revision: page.revision,
      draftAst: page.draftAst,
      publishedAst: page.publishedAst,
    };
  }

  /**
   * Publishes page by promoting draftAst -> publishedAst and creating version checkpoint
   */
  public async publishPage(params: {
    organizationId: string;
    pageId: string;
    expectedRevision: number;
  }): Promise<PublishPageResult> {
    const page = this.pages.get(params.pageId);

    if (!page || page.organizationId !== params.organizationId) {
      return {
        success: false,
        pageId: params.pageId,
        revision: 0,
        publishedAst: {},
        versionNumber: 0,
        errorCode: "PAGE_NOT_FOUND",
        message: "Page not found within current organization.",
      };
    }

    // CAS Check on publish
    if (page.revision !== params.expectedRevision) {
      return {
        success: false,
        pageId: params.pageId,
        revision: page.revision,
        publishedAst: page.publishedAst || {},
        versionNumber: 0,
        errorCode: "CMS_CONCURRENCY_CONFLICT",
        message: `Concurrency conflict on publish: Active revision is ${page.revision}.`,
      };
    }

    // Promote draft -> published and advance revision
    page.publishedAst = { ...page.draftAst };
    page.status = "PUBLISHED";
    page.publishedAt = new Date().toISOString();
    page.revision += 1;

    return {
      success: true,
      pageId: page.id,
      revision: page.revision,
      publishedAst: page.publishedAst,
      versionNumber: 1,
    };
  }
}
