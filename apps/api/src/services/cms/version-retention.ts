import { prisma, type PrismaClient } from "@suite/db";

/** Data model: the newest 30 snapshots per page survive; older rows are pruned (T097). */
export const CMS_PAGE_VERSION_RETENTION = 30;

export interface PrunePageVersionsInput {
  readonly organizationId: string;
  readonly pageId: string;
  readonly client?: PrismaClient;
}

/**
 * Prunes version history down to the newest 30 rows for one page.
 *
 * The cms_page_versions grant is append-only for app_tenant, so this procedure
 * is invoked by the schema owner (maintenance job), never by a tenant request.
 */
export async function prunePageVersions(input: PrunePageVersionsInput): Promise<number> {
  const client = input.client ?? prisma;
  const newest = await client.cmsPageVersion.findMany({
    where: { organizationId: input.organizationId, pageId: input.pageId },
    orderBy: [{ versionNumber: "desc" }],
    take: CMS_PAGE_VERSION_RETENTION,
    select: { id: true },
  });
  if (newest.length < CMS_PAGE_VERSION_RETENTION) {
    return 0;
  }
  const keptIds = newest.map((version) => version.id);
  const deleted = await client.cmsPageVersion.deleteMany({
    where: {
      organizationId: input.organizationId,
      pageId: input.pageId,
      id: { notIn: keptIds },
    },
  });
  return deleted.count;
}
