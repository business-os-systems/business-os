import { prisma } from "@suite/db";

export const cmsTestEnabled = Boolean(
  process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL
);

export interface CmsFixture {
  readonly organizationId: string;
  readonly siteId: string;
  readonly pageIds: readonly string[];
}

export interface CreateFixtureInput {
  readonly suffix: string;
  readonly pageCount: number;
  readonly changedPageCount: number;
}

function pageAst(title: string) {
  return {
    version: 1,
    schemaVersion: "2026-03",
    meta: { title },
    sections: [],
  };
}

export async function createCmsFixture(input: CreateFixtureInput): Promise<CmsFixture> {
  const organizationId = "org_wt351_" + input.suffix;
  const siteId = "site_wt351_" + input.suffix;
  await prisma.organization.create({
    data: {
      id: organizationId,
      name: "WT351 " + input.suffix,
      slug: "wt351-" + input.suffix.toLowerCase(),
    },
  });
  await prisma.cmsSite.create({
    data: {
      id: siteId,
      organizationId,
      title: "WT351 site " + input.suffix,
      slug: "wt351-site-" + input.suffix.toLowerCase(),
      status: "DRAFT",
      timezone: "UTC",
    },
  });
  const pageIds = Array.from(
    { length: input.pageCount },
    (_, index) => "page_wt351_" + input.suffix + "_" + String(index)
  );
  await Promise.all(
    pageIds.map((pageId, index) => {
      const changed = index < input.changedPageCount;
      const draft = pageAst("Page " + String(index) + " draft");
      const published = changed ? pageAst("Page " + String(index) + " live") : draft;
      return prisma.cmsPage.create({
        data: {
          id: pageId,
          organizationId,
          siteId,
          title: "Page " + String(index),
          slug: index === 0 ? "/" : "/page-" + String(index),
          orderIndex: index,
          isHomePage: index === 0,
          revision: 1,
          status: "DRAFT",
          content: { create: { draftAst: draft, publishedAst: published } },
        },
      });
    })
  );
  return { organizationId, siteId, pageIds };
}

export async function cleanupCmsFixture(organizationId: string): Promise<void> {
  await prisma.cmsAuditTrail.deleteMany({ where: { organizationId } });
  await prisma.cmsPageVersion.deleteMany({ where: { organizationId } });
  await prisma.cmsPageContent.deleteMany({ where: { organizationId } });
  await prisma.cmsPage.deleteMany({ where: { organizationId } });
  await prisma.cmsSite.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
}

export async function editDraft(input: {
  readonly organizationId: string;
  readonly pageId: string;
  readonly title: string;
}): Promise<void> {
  await prisma.cmsPage.update({
    where: { id: input.pageId },
    data: { revision: { increment: 1 } },
  });
  await prisma.cmsPageContent.update({
    where: {
      pageId_organizationId: { pageId: input.pageId, organizationId: input.organizationId },
    },
    data: { draftAst: pageAst(input.title) },
  });
}

export async function readPageState(input: {
  readonly organizationId: string;
  readonly pageId: string;
}) {
  return prisma.cmsPage.findFirstOrThrow({
    where: { id: input.pageId, organizationId: input.organizationId },
    include: { content: true },
  });
}

export async function createVersionRows(input: {
  readonly organizationId: string;
  readonly pageId: string;
  readonly count: number;
}): Promise<void> {
  await Promise.all(
    Array.from({ length: input.count }, (_, index) => {
      const versionNumber = index + 1;
      return prisma.cmsPageVersion.create({
        data: {
          organizationId: input.organizationId,
          pageId: input.pageId,
          versionNumber,
          astSnapshot: pageAst("Version " + String(versionNumber)),
          createdByUserId: "usr_wt351_actor",
        },
      });
    })
  );
}
