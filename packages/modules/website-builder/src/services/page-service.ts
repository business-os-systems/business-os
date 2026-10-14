import { prisma, Prisma } from "@suite/db";

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

export interface PageVersionRecord {
  id: string;
  organizationId: string;
  pageId: string;
  versionNumber: number;
  label?: string | null;
  astSnapshot: Record<string, unknown>;
  createdByUserId?: string | null;
  createdAt: string;
}

export interface PageRecord {
  id: string;
  organizationId: string;
  siteId: string;
  slug: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED" | "SCHEDULED";
  revision: number;
  isHomePage: boolean;
  orderIndex: number;
  draftAst: Record<string, unknown>;
  publishedAst?: Record<string, unknown> | null;
  publishedAt?: string | null;
}

export interface CreatePageInput {
  id?: string;
  organizationId: string;
  siteId: string;
  title: string;
  slug: string;
  isHomePage?: boolean;
  orderIndex?: number;
  draftAst?: Record<string, unknown>;
}

export class PageService {
  constructor(private readonly db = prisma) {}

  /**
   * Lists pages scoped strictly to tenant and site from PostgreSQL
   */
  public async listPages(
    organizationId: string,
    siteId: string
  ): Promise<PageRecord[]> {
    const pages = await this.db.cmsPage.findMany({
      where: {
        organizationId,
        siteId,
      },
      include: {
        content: true,
      },
      orderBy: [{ isHomePage: "desc" }, { orderIndex: "asc" }, { createdAt: "asc" }],
    });

    return pages.map((p) => ({
      id: p.id,
      organizationId: p.organizationId,
      siteId: p.siteId,
      title: p.title,
      slug: p.slug,
      status: p.status,
      revision: p.revision,
      isHomePage: p.isHomePage,
      orderIndex: p.orderIndex,
      draftAst: (p.content?.draftAst as Record<string, unknown>) || {},
      publishedAst: (p.content?.publishedAst as Record<string, unknown>) || null,
      publishedAt: p.content?.publishedAt ? p.content.publishedAt.toISOString() : null,
    }));
  }

  /**
   * Creates a page scoped to tenant and site in PostgreSQL
   */
  public async createPage(input: CreatePageInput): Promise<PageRecord> {
    const pageId = input.id || `page_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const normalizedSlug = input.slug.startsWith("/") ? input.slug : `/${input.slug}`;
    const initialAst = input.draftAst || {
      root: {
        id: "root-section-1",
        type: "section",
        children: [],
      },
    };

    const created = await this.db.cmsPage.create({
      data: {
        id: pageId,
        organizationId: input.organizationId,
        siteId: input.siteId,
        title: input.title,
        slug: normalizedSlug,
        isHomePage: input.isHomePage || false,
        orderIndex: input.orderIndex || 0,
        status: "DRAFT",
        revision: 1,
        content: {
          create: {
            draftAst: initialAst as unknown as Prisma.InputJsonValue,
          },
        },
      },
      include: {
        content: true,
      },
    });

    return {
      id: created.id,
      organizationId: created.organizationId,
      siteId: created.siteId,
      title: created.title,
      slug: created.slug,
      status: created.status,
      revision: created.revision,
      isHomePage: created.isHomePage,
      orderIndex: created.orderIndex,
      draftAst: (created.content?.draftAst as Record<string, unknown>) || initialAst,
      publishedAst: (created.content?.publishedAst as Record<string, unknown>) || null,
      publishedAt: created.content?.publishedAt ? created.content.publishedAt.toISOString() : null,
    };
  }

  /**
   * Retrieves a page with strict tenant isolation check from PostgreSQL
   */
  public async getPage(
    organizationId: string,
    pageId: string
  ): Promise<PageRecord | null> {
    const page = await this.db.cmsPage.findUnique({
      where: {
        id_organizationId: {
          id: pageId,
          organizationId,
        },
      },
      include: {
        content: true,
      },
    });

    if (!page) {
      return null;
    }

    return {
      id: page.id,
      organizationId: page.organizationId,
      siteId: page.siteId,
      title: page.title,
      slug: page.slug,
      status: page.status,
      revision: page.revision,
      isHomePage: page.isHomePage,
      orderIndex: page.orderIndex,
      draftAst: (page.content?.draftAst as Record<string, unknown>) || {},
      publishedAst: (page.content?.publishedAst as Record<string, unknown>) || null,
      publishedAt: page.content?.publishedAt ? page.content.publishedAt.toISOString() : null,
    };
  }

  /**
   * Deletes a page with strict tenant isolation check in PostgreSQL
   */
  public async deletePage(
    organizationId: string,
    pageId: string
  ): Promise<boolean> {
    try {
      const page = await this.db.cmsPage.findUnique({
        where: {
          id_organizationId: {
            id: pageId,
            organizationId,
          },
        },
      });

      if (!page) {
        return false;
      }

      await this.db.cmsPage.delete({
        where: {
          id_organizationId: {
            id: pageId,
            organizationId,
          },
        },
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Updates draft AST with atomic Compare-and-Swap (CAS) Concurrency Control in PostgreSQL
   */
  public async updateDraftContent(params: {
    organizationId: string;
    pageId: string;
    expectedRevision: number;
    draftAst: Record<string, unknown>;
  }): Promise<PageContentMutationResult> {
    const page = await this.getPage(params.organizationId, params.pageId);

    if (!page) {
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

    const nextRevision = page.revision + 1;

    try {
      await this.db.$transaction(async (tx) => {
        const updateResult = await tx.cmsPage.updateMany({
          where: {
            id: params.pageId,
            organizationId: params.organizationId,
            revision: params.expectedRevision,
          },
          data: {
            revision: nextRevision,
          },
        });

        if (updateResult.count === 0) {
          throw new Error("CMS_CONCURRENCY_CONFLICT");
        }

        await tx.cmsPageContent.upsert({
          where: {
            pageId_organizationId: {
              pageId: params.pageId,
              organizationId: params.organizationId,
            },
          },
          create: {
            organizationId: params.organizationId,
            pageId: params.pageId,
            draftAst: params.draftAst as unknown as Prisma.InputJsonValue,
          },
          update: {
            draftAst: params.draftAst as unknown as Prisma.InputJsonValue,
          },
        });
      });

      return {
        success: true,
        pageId: page.id,
        revision: nextRevision,
        draftAst: params.draftAst,
        publishedAst: page.publishedAst,
      };
    } catch (err: unknown) {
      const activePage = await this.getPage(params.organizationId, params.pageId);
      return {
        success: false,
        pageId: page.id,
        revision: activePage?.revision ?? page.revision,
        draftAst: activePage?.draftAst ?? page.draftAst,
        errorCode: "CMS_CONCURRENCY_CONFLICT",
        message: err instanceof Error ? err.message : "Page revision conflict.",
      };
    }
  }

  /**
   * Publishes page by promoting draftAst -> publishedAst and creating version checkpoint in PostgreSQL
   */
  public async publishPage(params: {
    organizationId: string;
    pageId: string;
    expectedRevision: number;
    createdByUserId?: string;
  }): Promise<PublishPageResult> {
    const page = await this.getPage(params.organizationId, params.pageId);

    if (!page) {
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

    const nextRevision = page.revision + 1;
    const existingVersionsCount = await this.db.cmsPageVersion.count({
      where: {
        organizationId: params.organizationId,
        pageId: params.pageId,
      },
    });
    const versionNumber = existingVersionsCount + 1;

    try {
      await this.db.$transaction(async (tx) => {
        const updateResult = await tx.cmsPage.updateMany({
          where: {
            id: params.pageId,
            organizationId: params.organizationId,
            revision: params.expectedRevision,
          },
          data: {
            revision: nextRevision,
            status: "PUBLISHED",
          },
        });

        if (updateResult.count === 0) {
          throw new Error("CMS_CONCURRENCY_CONFLICT");
        }

        await tx.cmsPageContent.update({
          where: {
            pageId_organizationId: {
              pageId: params.pageId,
              organizationId: params.organizationId,
            },
          },
          data: {
            publishedAst: page.draftAst as unknown as Prisma.InputJsonValue,
            publishedAt: new Date(),
          },
        });

        await tx.cmsPageVersion.create({
          data: {
            organizationId: params.organizationId,
            pageId: params.pageId,
            versionNumber,
            label: `Release v${versionNumber}`,
            astSnapshot: page.draftAst as unknown as Prisma.InputJsonValue,
            createdByUserId: params.createdByUserId || null,
          },
        });
      });

      return {
        success: true,
        pageId: page.id,
        revision: nextRevision,
        publishedAst: page.draftAst,
        versionNumber,
      };
    } catch (err: unknown) {
      const activePage = await this.getPage(params.organizationId, params.pageId);
      return {
        success: false,
        pageId: page.id,
        revision: activePage?.revision ?? page.revision,
        publishedAst: activePage?.publishedAst ?? {},
        versionNumber: 0,
        errorCode: "CMS_CONCURRENCY_CONFLICT",
        message: err instanceof Error ? err.message : "Revision conflict on publish.",
      };
    }
  }

  /**
   * Lists immutable version snapshots for a page from PostgreSQL
   */
  public async listPageVersions(
    organizationId: string,
    pageId: string
  ): Promise<PageVersionRecord[]> {
    const versions = await this.db.cmsPageVersion.findMany({
      where: {
        organizationId,
        pageId,
      },
      orderBy: {
        versionNumber: "desc",
      },
    });

    return versions.map((v) => ({
      id: v.id,
      organizationId: v.organizationId,
      pageId: v.pageId,
      versionNumber: v.versionNumber,
      label: v.label,
      astSnapshot: v.astSnapshot as Record<string, unknown>,
      createdByUserId: v.createdByUserId,
      createdAt: v.createdAt.toISOString(),
    }));
  }

  /**
   * Rolls back a page's draft and published state to a prior immutable version snapshot in PostgreSQL
   */
  public async rollbackPageVersion(params: {
    organizationId: string;
    pageId: string;
    versionNumber: number;
    expectedRevision: number;
  }): Promise<{
    success: boolean;
    pageId: string;
    revision: number;
    restoredVersion: number;
    draftAst: Record<string, unknown>;
    errorCode?: string;
    message?: string;
  }> {
    const page = await this.getPage(params.organizationId, params.pageId);
    if (!page) {
      return {
        success: false,
        pageId: params.pageId,
        revision: 0,
        restoredVersion: 0,
        draftAst: {},
        errorCode: "PAGE_NOT_FOUND",
        message: "Page not found within organization.",
      };
    }

    if (page.revision !== params.expectedRevision) {
      return {
        success: false,
        pageId: params.pageId,
        revision: page.revision,
        restoredVersion: 0,
        draftAst: page.draftAst,
        errorCode: "CMS_CONCURRENCY_CONFLICT",
        message: `Concurrency conflict on rollback: Active revision is ${page.revision}.`,
      };
    }

    const versions = await this.listPageVersions(params.organizationId, params.pageId);
    const targetVersion = versions.find((v) => v.versionNumber === params.versionNumber);

    if (!targetVersion) {
      return {
        success: false,
        pageId: params.pageId,
        revision: page.revision,
        restoredVersion: 0,
        draftAst: page.draftAst,
        errorCode: "VERSION_NOT_FOUND",
        message: `Version ${params.versionNumber} not found for page.`,
      };
    }

    const nextRevision = page.revision + 1;

    try {
      await this.db.$transaction(async (tx) => {
        const updateResult = await tx.cmsPage.updateMany({
          where: {
            id: params.pageId,
            organizationId: params.organizationId,
            revision: params.expectedRevision,
          },
          data: {
            revision: nextRevision,
          },
        });

        if (updateResult.count === 0) {
          throw new Error("CMS_CONCURRENCY_CONFLICT");
        }

        await tx.cmsPageContent.update({
          where: {
            pageId_organizationId: {
              pageId: params.pageId,
              organizationId: params.organizationId,
            },
          },
          data: {
            draftAst: targetVersion.astSnapshot as unknown as Prisma.InputJsonValue,
            publishedAst: targetVersion.astSnapshot as unknown as Prisma.InputJsonValue,
            publishedAt: new Date(),
          },
        });
      });

      return {
        success: true,
        pageId: page.id,
        revision: nextRevision,
        restoredVersion: targetVersion.versionNumber,
        draftAst: targetVersion.astSnapshot,
      };
    } catch (err: unknown) {
      const activePage = await this.getPage(params.organizationId, params.pageId);
      return {
        success: false,
        pageId: page.id,
        revision: activePage?.revision ?? page.revision,
        restoredVersion: 0,
        draftAst: activePage?.draftAst ?? page.draftAst,
        errorCode: "CMS_CONCURRENCY_CONFLICT",
        message: err instanceof Error ? err.message : "Revision conflict on rollback.",
      };
    }
  }
}
