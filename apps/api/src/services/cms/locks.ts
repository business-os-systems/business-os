import { Prisma } from "@suite/db";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { NotFoundError } from "@suite/core/errors";

/** Serializes every release for one site so concurrent confirms cannot fan out. */
export async function lockSiteRow(
  tx: Prisma.TransactionClient,
  input: { readonly organizationId: string; readonly siteId: string }
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "cms"."cms_sites"
     WHERE "id" = ${input.siteId} AND "organizationId" = ${input.organizationId}
     FOR UPDATE
  `);
  if (rows.length === 0) {
    throw new NotFoundError("The requested site was not found.", {
      code: PLATFORM_ERROR_CODE.NOT_FOUND,
    });
  }
}

/** Locks the site's pages in a stable order so a release cannot race an editor. */
export async function lockSitePages(
  tx: Prisma.TransactionClient,
  input: { readonly organizationId: string; readonly siteId: string }
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "cms"."cms_pages"
     WHERE "siteId" = ${input.siteId} AND "organizationId" = ${input.organizationId}
     ORDER BY "id" ASC
     FOR UPDATE
  `);
}

/** Locks content rows too, so an autosave cannot slip between review and release. */
export async function lockSiteContents(
  tx: Prisma.TransactionClient,
  input: { readonly organizationId: string; readonly siteId: string }
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "cms"."cms_page_contents"
     WHERE "pageId" IN (
       SELECT "id" FROM "cms"."cms_pages"
        WHERE "siteId" = ${input.siteId} AND "organizationId" = ${input.organizationId}
     )
     ORDER BY "id" ASC
     FOR UPDATE
  `);
}

/** Locks one page row for a version restore. */
export async function lockPageRow(
  tx: Prisma.TransactionClient,
  input: { readonly organizationId: string; readonly pageId: string }
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "cms"."cms_pages"
     WHERE "id" = ${input.pageId} AND "organizationId" = ${input.organizationId}
     FOR UPDATE
  `);
  if (rows.length === 0) {
    throw new NotFoundError("The requested page was not found.", {
      code: PLATFORM_ERROR_CODE.NOT_FOUND,
    });
  }
}
