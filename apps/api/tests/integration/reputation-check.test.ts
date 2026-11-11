import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PrismaClient } from "@suite/db";
import { CMS_AUDIT_ACTIONS } from "@suite/website-builder/audit";
import {
  ReputationBlockedHostError,
  REPUTATION_TRIGGERS,
  assertPublishReputationClear,
  runReputationCheck,
} from "../../src/jobs/reputation-check.js";
import { ReputationFeedUnavailableError } from "../../src/services/abuse/reputation-feed.js";
import { loadPlatformTestEnv } from "../helpers/platform-env.js";
import {
  createPlatformOwnerTestClient,
  createPlatformTestClient,
  platformIntegrationTestsEnabled,
} from "../helpers/platform-db.js";

loadPlatformTestEnv();

const HOST_SUFFIX = ".business-os.site";

const enabled =
  platformIntegrationTestsEnabled() &&
  Boolean(process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL);

interface Fixture {
  readonly orgId: string;
  readonly siteId: string;
  readonly domainId: string;
}

  const suffix = Date.now().toString(36);
  const createdOrgIds: string[] = [];
  let platformPrisma: PrismaClient;
  let ownerPrisma: PrismaClient;
  let workDir: string;
  let feedCounter = 0;

  async function writeFeed(blockedHosts: readonly string[], updatedAt = "2026-11-11T00:00:00.000Z") {
    const path = join(workDir, "feed-" + ++feedCounter + ".json");
    await writeFile(path, JSON.stringify({ updatedAt, blockedHosts }));
    process.env.ABUSE_REPUTATION_FEED_PATH = path;
    return path;
  }

  async function createFixture(hostname: string): Promise<Fixture> {
    const index = createdOrgIds.length;
    const organization = await ownerPrisma.organization.create({
      data: {
        name: "Reputation Tenant " + suffix + "-" + index,
        slug: "reputation-" + suffix + "-" + index,
        status: "ACTIVE",
      },
    });
    createdOrgIds.push(organization.id);
    const site = await ownerPrisma.cmsSite.create({
      data: {
        organizationId: organization.id,
        title: "Reputation Site",
        slug: "reputation-site-" + suffix + "-" + index,
        status: "PUBLISHED",
      },
    });
    const domain = await ownerPrisma.cmsDomain.create({
      data: {
        organizationId: organization.id,
        siteId: site.id,
        hostname,
        isPrimary: true,
        isSubdomain: true,
        status: "ACTIVE",
        verificationToken: "verify-" + suffix + "-" + index,
      },
    });
    return { orgId: organization.id, siteId: site.id, domainId: domain.id };
  }

  async function verdictCount(siteId: string): Promise<number> {
    return ownerPrisma.cmsAuditTrail.count({
      where: { siteId, action: CMS_AUDIT_ACTIONS.REPUTATION_VERDICT_RECORDED },
    });
  }

if (enabled) beforeAll(async () => {
    platformPrisma = createPlatformTestClient();
    ownerPrisma = createPlatformOwnerTestClient();
    workDir = await mkdtemp(join(tmpdir(), "reputation-job-"));
  });

if (enabled) afterAll(async () => {
    delete process.env.ABUSE_REPUTATION_FEED_PATH;
    if (createdOrgIds.length > 0) {
      await ownerPrisma.auditEvent.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await ownerPrisma.cmsDomain.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await ownerPrisma.cmsSite.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await ownerPrisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    }
    await platformPrisma.$disconnect();
    await ownerPrisma.$disconnect();
    await rm(workDir, { recursive: true, force: true });
  });

it.skipIf(!enabled)("passes a legitimate host once and does not re-audit an unchanged verdict", async () => {
    const fixture = await createFixture("river-view-" + suffix + HOST_SUFFIX);
    await writeFeed([]);
    const first = await runReputationCheck({
      trigger: REPUTATION_TRIGGERS.DAILY,
      organizationId: fixture.orgId,
    });
    expect(first.checked).toBe(1);
    expect(first.passed).toBe(1);
    expect(first.recorded).toBe(1);

    const second = await runReputationCheck({
      trigger: REPUTATION_TRIGGERS.DAILY,
      organizationId: fixture.orgId,
    });
    expect(second.checked).toBe(1);
    expect(second.recorded).toBe(0);
    expect(await verdictCount(fixture.siteId)).toBe(1);
  });

it.skipIf(!enabled)("detects a reserved host and a blocked feed host without dropping the site", async () => {
    const fixture = await createFixture("admin-" + suffix + HOST_SUFFIX);
    await writeFeed(["blocked-" + suffix + HOST_SUFFIX]);
    const reserved = await runReputationCheck({
      trigger: REPUTATION_TRIGGERS.DAILY,
      organizationId: fixture.orgId,
    });
    expect(reserved.review).toBe(1);
    expect(reserved.blocked).toBe(0);

    await ownerPrisma.cmsDomain.update({
      where: { id: fixture.domainId },
      data: {
        hostname: "blocked-" + suffix + HOST_SUFFIX,
        verificationToken: "verify-blocked-" + suffix,
      },
    });
    const blocked = await runReputationCheck({
      trigger: REPUTATION_TRIGGERS.DAILY,
      organizationId: fixture.orgId,
    });
    expect(blocked.blocked).toBe(1);
    expect(
      (await ownerPrisma.cmsSite.findUniqueOrThrow({ where: { id: fixture.siteId } })).status
    ).toBe("PUBLISHED");
    expect(await verdictCount(fixture.siteId)).toBe(2);
  });

it.skipIf(!enabled)("fails the publish path closed when the configured feed is unreadable", async () => {
    const fixture = await createFixture("publish-unreadable-" + suffix + HOST_SUFFIX);
    process.env.ABUSE_REPUTATION_FEED_PATH = "/does/not/exist-feed.json";
    await expect(
      runReputationCheck({
        trigger: REPUTATION_TRIGGERS.PUBLISH,
        organizationId: fixture.orgId,
      })
    ).rejects.toBeInstanceOf(ReputationFeedUnavailableError);
  });

it.skipIf(!enabled)("records one FEED_UNAVAILABLE verdict for a daily run and continues", async () => {
    const fixture = await createFixture("daily-feed-" + suffix + HOST_SUFFIX);
    process.env.ABUSE_REPUTATION_FEED_PATH = "/does/not/exist-feed.json";
    const first = await runReputationCheck({
      trigger: REPUTATION_TRIGGERS.DAILY,
      organizationId: fixture.orgId,
    });
    expect(first.feedUnavailable).toBe(1);
    const second = await runReputationCheck({
      trigger: REPUTATION_TRIGGERS.DAILY,
      organizationId: fixture.orgId,
    });
    expect(second.recorded).toBe(0);
    expect(await verdictCount(fixture.siteId)).toBe(1);
  });

it.skipIf(!enabled)("blocks publish when the feed lists a published host", async () => {
    const fixture = await createFixture("publish-blocked-" + suffix + HOST_SUFFIX);
    await writeFeed(["publish-blocked-" + suffix + HOST_SUFFIX]);
    await expect(
      assertPublishReputationClear({
        organizationId: fixture.orgId,
        siteIds: [fixture.siteId],
      })
    ).rejects.toBeInstanceOf(ReputationBlockedHostError);
  });
