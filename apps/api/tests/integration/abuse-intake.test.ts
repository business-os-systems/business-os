import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { prisma } from "@suite/db";
import { CMS_AUDIT_ACTIONS } from "@suite/website-builder/audit";
import { globalErrorHandler } from "../../src/middleware/error-handler.js";
import { abuseRouter } from "../../src/routes/abuse.js";
import {
  ABUSE_REPORT_CATEGORIES,
  ABUSE_REPORT_OUTCOMES,
  recordAbuseReport,
} from "../../src/services/abuse/abuse-intake.service.js";

const enabled = Boolean(process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL);
const RUN = Date.now().toString(36);
const ORG = "org_wt377_abuse_" + RUN;
const SITE = "site_wt377_abuse_" + RUN;
const DRAFT_SITE = "site_wt377_abuse_draft_" + RUN;
const HOST = "abuse-" + RUN + ".business-os.site";
const DRAFT_HOST = "draft-" + RUN + ".business-os.site";

async function cleanup(): Promise<void> {
  await prisma.cmsAuditTrail.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsDomain.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsSite.deleteMany({ where: { organizationId: ORG } });
  await prisma.organization.deleteMany({ where: { id: ORG } });
}

async function intakeCount(): Promise<number> {
  return prisma.cmsAuditTrail.count({
    where: { organizationId: ORG, action: CMS_AUDIT_ACTIONS.ABUSE_REPORT_RECEIVED },
  });
}

beforeAll(async () => {
  if (!enabled) {
    return;
  }
  await cleanup();
  await prisma.organization.create({
    data: { id: ORG, name: "WT377 abuse", slug: "wt377-abuse-" + RUN },
  });
  await prisma.cmsSite.create({
    data: {
      id: SITE,
      organizationId: ORG,
      title: "Published abuse target",
      slug: "wt377-abuse-published-" + RUN,
      status: "PUBLISHED",
    },
  });
  await prisma.cmsSite.create({
    data: {
      id: DRAFT_SITE,
      organizationId: ORG,
      title: "Draft abuse target",
      slug: "wt377-abuse-draft-" + RUN,
      status: "DRAFT",
    },
  });
  await prisma.cmsDomain.create({
    data: {
      organizationId: ORG,
      siteId: SITE,
      hostname: HOST,
      isPrimary: true,
      isSubdomain: true,
      status: "ACTIVE",
      verificationToken: "verify-" + RUN,
    },
  });
  await prisma.cmsDomain.create({
    data: {
      organizationId: ORG,
      siteId: DRAFT_SITE,
      hostname: DRAFT_HOST,
      isSubdomain: true,
      status: "ACTIVE",
      verificationToken: "verify-draft-" + RUN,
    },
  });
});

afterAll(async () => {
  if (!enabled) {
    return;
  }
  await cleanup();
  await prisma.$disconnect();
});

describe.skipIf(!enabled)("Abuse report intake", () => {
  it("records the report with its outcome as one immutable evidence row", async () => {
    const details = "The published page copies a bank sign-in form word for word.";
    const report = await recordAbuseReport({
      hostname: HOST.toUpperCase(),
      category: ABUSE_REPORT_CATEGORIES.PHISHING,
      details,
    });
    expect(report.outcome).toBe(ABUSE_REPORT_OUTCOMES.RECEIVED);
    expect(report.siteId).toBe(SITE);

    const audit = await prisma.cmsAuditTrail.findFirstOrThrow({
      where: {
        organizationId: ORG,
        siteId: SITE,
        action: CMS_AUDIT_ACTIONS.ABUSE_REPORT_RECEIVED,
        entityId: SITE,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.actorUserId).toBe("public:abuse-report");
    expect(audit.changesJson).toMatchObject({
      reportId: report.reportId,
      category: "PHISHING",
      hostname: HOST,
      outcome: "RECEIVED",
      details,
    });
  });

  it("keeps one separate record per report instead of overwriting the first", async () => {
    const before = await intakeCount();
    await recordAbuseReport({
      hostname: HOST,
      category: ABUSE_REPORT_CATEGORIES.SPAM,
      details: "The same page now posts unrelated gambling links in every form.",
    });
    expect(await intakeCount()).toBe(before + 1);
  });
});

describe.skipIf(!enabled)("Abuse report intake guards", () => {
  it("refuses a host that does not resolve to a published site", async () => {
    const before = await intakeCount();
    await expect(
      recordAbuseReport({
        hostname: "not-on-the-platform-" + RUN + ".example",
        category: ABUSE_REPORT_CATEGORIES.SPAM,
        details: "This host is not one of the platform's published sites.",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await intakeCount()).toBe(before);
  });

  it("refuses a draft site's host, which no visitor can reach", async () => {
    await expect(
      recordAbuseReport({
        hostname: DRAFT_HOST,
        category: ABUSE_REPORT_CATEGORIES.MALWARE,
        details: "A draft site's host must not become a report target.",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses an undeclared category at the service boundary", async () => {
    await expect(
      recordAbuseReport({
        hostname: HOST,
        category: "NOT_A_CATEGORY",
        details: "The service must not trust a caller that skipped the route schema.",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("refuses a hostname above the declared length", async () => {
    await expect(
      recordAbuseReport({
        hostname: "a".repeat(256) + ".example",
        category: ABUSE_REPORT_CATEGORIES.SPAM,
        details: "The service must bound the hostname even when the route schema is bypassed.",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("refuses a detail shorter than the declared minimum", async () => {
    await expect(
      recordAbuseReport({
        hostname: HOST,
        category: ABUSE_REPORT_CATEGORIES.OTHER,
        details: "too short",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});

describe.skipIf(!enabled)("Abuse report route", () => {
  function createApp(): Hono {
    const app = new Hono();
    app.onError(globalErrorHandler);
    app.route("/api/v1/abuse", abuseRouter);
    return app;
  }

  it("accepts a valid report and returns only the intake identity", async () => {
    const response = await createApp().request("/api/v1/abuse/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hostname: HOST,
        category: "SPAM",
        details: "The page posts promotional comments into unrelated forms.",
      }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      success: boolean;
      data: { reportId: string; outcome: string; receivedAt: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.reportId.length).toBeGreaterThan(0);
    expect(body.data.outcome).toBe("RECEIVED");
    expect(body.data).not.toHaveProperty("siteId");
    expect(body.data).not.toHaveProperty("organizationId");
  });

  it("refuses an undeclared category and an invalid host", async () => {
    const app = createApp();
    const badCategory = await app.request("/api/v1/abuse/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hostname: HOST,
        category: "NOT_A_CATEGORY",
        details: "This category is not part of the abuse vocabulary.",
      }),
    });
    expect(badCategory.status).toBe(422);

    const badHost = await app.request("/api/v1/abuse/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hostname: "missing-" + RUN + ".example",
        category: "SPAM",
        details: "This host is not one of the platform's published sites.",
      }),
    });
    expect(badHost.status).toBe(404);
  });
});
