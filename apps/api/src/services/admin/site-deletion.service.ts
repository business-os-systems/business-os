import { Prisma, withTenantContext } from "@suite/db";
import {
  PLATFORM_ERROR_CODE,
  TENANT_LIFECYCLE_REASON_MAX_LENGTH,
  TENANT_LIFECYCLE_REASON_MIN_LENGTH,
} from "@suite/core";
import { ConflictError, NotFoundError, ValidationError } from "@suite/core/errors";
import { writeCmsAudit } from "@suite/website-builder/services";
import { CMS_AUDIT_ACTIONS, CMS_AUDIT_ENTITY_TYPES } from "@suite/website-builder/audit";
import { assertFreshStepUp } from "./step-up-guard.service.js";
import { SITE_LIST_LIMIT } from "./site-takedown.contract.js";
import { readStatus } from "./site-takedown.service.js";
import type {
  DeletionFlaggedSite,
  SiteDeletionConfirmationBody,
  SiteDeletionResult,
} from "./site-deletion.contract.js";

const SITE_NOT_FOUND = "The requested site was not found in this tenant.";
const NOT_FLAGGED_MESSAGE =
  "This site is not flagged for deletion. Only an inactive site that the lifecycle job flagged may be removed.";
const ALREADY_CONFIRMED_MESSAGE = "Removal for this site was already confirmed.";
const CONFIRMATION_MISMATCH_MESSAGE = "The confirmation slug does not match this site.";
const REASON_REQUIRED_MESSAGE =
  "A reason of " +
  TENANT_LIFECYCLE_REASON_MIN_LENGTH +
  " to " +
  TENANT_LIFECYCLE_REASON_MAX_LENGTH +
  " characters is required.";

interface FlaggedSiteRow {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly status: string;
  readonly deletionFlaggedAt: Date;
}

interface LockedSiteRow {
  readonly id: string;
  readonly slug: string;
  readonly status: string;
  readonly deletionFlaggedAt: Date | null;
  readonly deletionConfirmedAt: Date | null;
}

function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (
    trimmed.length < TENANT_LIFECYCLE_REASON_MIN_LENGTH ||
    trimmed.length > TENANT_LIFECYCLE_REASON_MAX_LENGTH
  ) {
    throw new ValidationError(REASON_REQUIRED_MESSAGE, undefined, {
      code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
    });
  }
  return trimmed;
}

/** Sites the lifecycle job flagged and no human has confirmed for removal. */
export async function listDeletionFlaggedSites(
  organizationId: string,
): Promise<readonly DeletionFlaggedSite[]> {
  return withTenantContext(organizationId, async (tx) => {
    const rows = await tx.$queryRaw<FlaggedSiteRow[]>(Prisma.sql`
      SELECT "id", "title", "slug", "status"::text AS "status", "deletionFlaggedAt"
        FROM "cms"."cms_sites"
       WHERE "organizationId" = ${organizationId}
         AND "deletionFlaggedAt" IS NOT NULL
         AND "deletionConfirmedAt" IS NULL
       ORDER BY "deletionFlaggedAt" ASC, "id" ASC
       LIMIT ${SITE_LIST_LIMIT}
    `);
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: readStatus(row.status),
      deletionFlaggedAt: row.deletionFlaggedAt.toISOString(),
    }));
  });
}

export interface ConfirmSiteDeletionInput {
  readonly organizationId: string;
  readonly siteId: string;
  readonly body: SiteDeletionConfirmationBody;
  readonly operatorId: string;
  readonly stepUpToken: string | null;
}

async function lockSite(
  tx: Prisma.TransactionClient,
  input: ConfirmSiteDeletionInput,
): Promise<LockedSiteRow> {
  const rows = await tx.$queryRaw<LockedSiteRow[]>(Prisma.sql`
    SELECT "id", "slug", "status"::text AS "status",
           "deletionFlaggedAt", "deletionConfirmedAt"
      FROM "cms"."cms_sites"
     WHERE "id" = ${input.siteId} AND "organizationId" = ${input.organizationId}
     FOR UPDATE
  `);
  const site = rows[0];
  if (site === undefined) {
    throw new NotFoundError(SITE_NOT_FOUND, { code: PLATFORM_ERROR_CODE.NOT_FOUND });
  }
  return site;
}

function assertRemovalAllowed(site: LockedSiteRow, input: ConfirmSiteDeletionInput): void {
  if (site.status !== input.body.expectedStatus) {
    throw new ConflictError(
      "The site status changed since it was observed. Reload the record and retry.",
      { code: PLATFORM_ERROR_CODE.LIFECYCLE_CONFLICT },
    );
  }
  if (site.deletionConfirmedAt !== null) {
    throw new ConflictError(ALREADY_CONFIRMED_MESSAGE, {
      code: PLATFORM_ERROR_CODE.LIFECYCLE_CONFLICT,
    });
  }
  if (site.slug !== input.body.confirmSlug) {
    throw new ValidationError(CONFIRMATION_MISMATCH_MESSAGE, undefined, {
      code: PLATFORM_ERROR_CODE.SLUG_MISMATCH,
    });
  }
  if (site.deletionFlaggedAt === null) {
    throw new ValidationError(NOT_FLAGGED_MESSAGE, undefined, {
      code: PLATFORM_ERROR_CODE.INVALID_TRANSITION,
    });
  }
}

interface PurgeCounts {
  readonly pages: number;
  readonly inquiries: number;
}

/**
 * Confirmed removal deletes site content, never the site identity or its audit
 * trail: the site row is archived so the history of who approved removal stays
 * readable (FR-099). Runs under the tenant RLS context and the row lock.
 */
async function purgeSiteContent(
  tx: Prisma.TransactionClient,
  input: ConfirmSiteDeletionInput,
): Promise<PurgeCounts> {
  const scope = { organizationId: input.organizationId, siteId: input.siteId };
  const pages = await tx.cmsPage.deleteMany({ where: scope });
  const inquiries = await tx.cmsInquiry.deleteMany({ where: scope });
  await Promise.all([
    tx.cmsDomain.deleteMany({ where: scope }),
    tx.cmsUrlRedirect.deleteMany({ where: scope }),
    tx.cmsSiteAppearance.deleteMany({ where: scope }),
    tx.cmsSiteSettings.deleteMany({ where: scope }),
    tx.cmsSiteSeoSettings.deleteMany({ where: scope }),
    tx.cmsSiteLocale.deleteMany({ where: scope }),
    tx.cmsNavigationMenu.deleteMany({ where: scope }),
    tx.cmsSiteAnalyticsDaily.deleteMany({ where: scope }),
    tx.cmsPluginInstallation.deleteMany({ where: scope }),
    tx.cmsCollection.deleteMany({ where: scope }),
  ]);
  return { pages: pages.count, inquiries: inquiries.count };
}

export async function confirmSiteDeletion(
  input: ConfirmSiteDeletionInput,
): Promise<SiteDeletionResult> {
  const reason = requireReason(input.body.reason);
  await assertFreshStepUp({
    operatorId: input.operatorId,
    token: input.stepUpToken,
  });
  return withTenantContext(input.organizationId, async (tx) => {
    const site = await lockSite(tx, input);
    assertRemovalAllowed(site, input);
    const purged = await purgeSiteContent(tx, input);
    const confirmedAt = new Date();
    await tx.cmsSite.update({
      where: {
        id_organizationId: { id: input.siteId, organizationId: input.organizationId },
      },
      data: {
        status: "ARCHIVED",
        deletionConfirmedAt: confirmedAt,
        deletionConfirmedBy: input.operatorId,
      },
    });
    await writeCmsAudit(tx, {
      organizationId: input.organizationId,
      siteId: input.siteId,
      action: CMS_AUDIT_ACTIONS.SITE_DELETION_CONFIRMED,
      entityType: CMS_AUDIT_ENTITY_TYPES.SITE,
      entityId: input.siteId,
      actorUserId: input.operatorId,
      changes: {
        reason,
        fromStatus: site.status,
        toStatus: "ARCHIVED",
        purgedPages: purged.pages,
        purgedInquiries: purged.inquiries,
      },
    });
    return {
      siteId: input.siteId,
      status: "ARCHIVED" as const,
      confirmedAt: confirmedAt.toISOString(),
      purgedPages: purged.pages,
      purgedInquiries: purged.inquiries,
    };
  });
}
