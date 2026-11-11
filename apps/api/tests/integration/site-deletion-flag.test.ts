import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@suite/db";
import { CMS_AUDIT_ACTIONS, CMS_AUDIT_ENTITY_TYPES } from "@suite/website-builder/audit";
import {
  SITE_DELETION_FLAG_ACTOR,
  flagInactiveSites,
  flagSiteForDeletion,
  main,
} from "../../src/jobs/site-deletion-flag.js";

const enabled = Boolean(process.env.DATABASE_URL);
const RUN = Date.now().toString(36).toUpperCase();
const ORG = "org_wt378_flag_" + RUN;
const NOW = new Date("2026-11-12T02:27:18Z");
const OLD = new Date(NOW.getTime() - 90 * 24 * 60 * 60 * 1000);

async function createSite(
  id: string,
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED",
  updatedAt: Date,
  flaggedAt: Date | null = null,
) {
  return prisma.cmsSite.create({
    data: {
      id,
      organizationId: ORG,
      title: "Site " + id,
      slug: id,
      status,
      updatedAt,
      deletionFlaggedAt: flaggedAt,
    },
  });
}

async function cleanup(): Promise<void> {
  await prisma.cmsAuditTrail.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsSite.deleteMany({ where: { organizationId: ORG } });
  await prisma.organization.deleteMany({ where: { id: ORG } });
}

beforeAll(async () => {
  if (!enabled) {
    return;
  }
  await cleanup();
  await prisma.organization.create({
    data: { id: ORG, name: "WT378 flag", slug: "wt378-flag-" + RUN.toLowerCase() },
  });
  await Promise.all([
    createSite("site_wt378_stale_draft_" + RUN, "DRAFT", OLD),
    createSite("site_wt378_stale_live_" + RUN, "PUBLISHED", OLD),
    createSite("site_wt378_recent_" + RUN, "DRAFT", NOW),
    createSite("site_wt378_archived_" + RUN, "ARCHIVED", OLD),
    createSite("site_wt378_already_" + RUN, "DRAFT", OLD, OLD),
  ]);
});

afterAll(async () => {
  if (!enabled) {
    return;
  }
  await cleanup();
  await prisma.$disconnect();
});

describe.skipIf(!enabled)("inactive-site deletion flag (FR-097, T158)", () => {
  it("flags only inactive sites that are not archived or already flagged", async () => {
    const result = await flagInactiveSites({
      client: prisma,
      now: NOW,
      olderThanDays: 30,
      organizationIds: [ORG],
    });
    expect(result.flagged).toBe(2);
    const flagged = await prisma.cmsSite.findMany({
      where: { organizationId: ORG, deletionFlaggedAt: { not: null } },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    expect(flagged.map((site) => site.id)).toEqual([
      "site_wt378_already_" + RUN,
      "site_wt378_stale_draft_" + RUN,
      "site_wt378_stale_live_" + RUN,
    ]);
    const recent = await prisma.cmsSite.findFirstOrThrow({
      where: { organizationId: ORG, id: "site_wt378_recent_" + RUN },
    });
    expect(recent.deletionFlaggedAt).toBeNull();
    const archived = await prisma.cmsSite.findFirstOrThrow({
      where: { organizationId: ORG, id: "site_wt378_archived_" + RUN },
    });
    expect(archived.deletionFlaggedAt).toBeNull();
  });

  it("writes an audit row for every flagged site", async () => {
    const audits = await prisma.cmsAuditTrail.findMany({
      where: {
        organizationId: ORG,
        action: CMS_AUDIT_ACTIONS.SITE_DELETION_FLAGGED,
        entityType: CMS_AUDIT_ENTITY_TYPES.SITE,
      },
    });
    expect(audits).toHaveLength(2);
    expect(audits.every((audit) => audit.actorUserId === SITE_DELETION_FLAG_ACTOR)).toBe(true);
  });

});

describe.skipIf(!enabled)("inactive-site sweep and entrypoint (FR-097, T158)", () => {
  it("returns false when a concurrent run already claimed the site", async () => {
    const didFlag = await flagSiteForDeletion({
      client: prisma,
      site: {
        id: "site_wt378_missing_" + RUN,
        organizationId: ORG,
        updatedAt: NOW,
      },
      now: NOW,
      thresholdDays: 30,
    });
    expect(didFlag).toBe(false);
  });

  it("sweeps every tenant when no organization scope is supplied", async () => {
    const result = await flagInactiveSites({
      client: prisma,
      now: new Date(0),
      olderThanDays: 1,
    });
    expect(result.flagged).toBe(0);
  });

  it("runs from the job entrypoint with a bounded scope", async () => {
    await main({
      client: prisma,
      now: NOW,
      olderThanDays: 30,
      organizationIds: [ORG],
    });
  });

  it("is idempotent: a second run flags nothing", async () => {
    const result = await flagInactiveSites({
      client: prisma,
      now: NOW,
      olderThanDays: 30,
      organizationIds: [ORG],
    });
    expect(result.flagged).toBe(0);
  });
});
