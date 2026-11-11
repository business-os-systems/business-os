import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { PERMISSIONS } from "@suite/core";
import { prisma } from "@suite/db";
import { globalErrorHandler } from "../../src/middleware/error-handler.js";
import { createCmsInquiriesRouter } from "../../src/routes/cms/inquiries.js";
import {
  changeTenantInquiryStatus,
  countTenantUnreadInquiries,
  eraseTenantInquiry,
  getTenantInquiry,
  listTenantInquiries,
} from "../../src/services/cms/inquiry-service.js";
import {
  ingestPublicSubmission,
  type PublicSubmissionInput,
} from "../../src/services/cms/form-ingestion.js";
import { runInquiryRetention } from "../../src/jobs/inquiry-retention.js";

const enabled = Boolean(process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL);
const RUN = Date.now().toString(36);
const ORG_A = "org_wt353_a_" + RUN;
const ORG_B = "org_wt353_b_" + RUN;
const SITE_A = "site_wt353_a_" + RUN;
const SITE_B = "site_wt353_b_" + RUN;
const BLOCK = "block_contact_" + RUN;

const PAGE_AST = {
  version: 1,
  schemaVersion: "2026-03",
  sections: [
    {
      id: "sec_" + RUN,
      blocks: [
        {
          id: BLOCK,
          type: "form",
          props: {
            formId: "form_" + RUN,
            fields: [
              { id: "f_name", name: "name", label: "Name", type: "text", required: true },
              { id: "f_email", name: "email", label: "Email", type: "email", required: true },
              { id: "f_message", name: "message", label: "Message", type: "textarea" },
            ],
          },
        },
      ],
    },
  ],
};

async function cleanup(): Promise<void> {
  const orgs = [ORG_A, ORG_B];
  await prisma.cmsInquiryEvent.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.cmsInquiry.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.cmsAuditTrail.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.cmsPageContent.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.cmsPage.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.cmsSite.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
}

async function seedTenant(id: string, label: string, siteId: string): Promise<void> {
  await prisma.organization.create({
    data: { id, name: "T-08 " + label, slug: "wt353-" + label + "-" + RUN },
  });
  await prisma.cmsSite.create({
    data: {
      id: siteId,
      organizationId: id,
      title: "T-08 " + label,
      slug: "wt353-" + label + "-" + RUN,
      status: "PUBLISHED",
    },
  });
  await prisma.cmsPage.create({
    data: {
      organizationId: id,
      siteId,
      title: "Contact",
      slug: "/contact",
      status: "PUBLISHED",
      isHomePage: true,
      content: { create: { publishedAst: PAGE_AST } },
    },
  });
}

function payload(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    name: "Jane Doe",
    email: "jane.doe@example.org",
    message: "Please call me about a booking.",
    ...overrides,
  };
}

let submissionCount = 0;

function submission(overrides: Partial<PublicSubmissionInput> = {}): PublicSubmissionInput {
  submissionCount += 1;
  return {
    siteId: SITE_A,
    blockId: BLOCK,
    idempotencyKey: "idem-" + RUN + "-" + submissionCount,
    payload: payload(),
    attachments: [],
    turnstileToken: "valid-turnstile-token",
    honeypot: null,
    clientIp: "203.0.113.7",
    userAgent: "vitest",
    ...overrides,
  };
}

let firstInquiryId = "";

beforeAll(async () => {
  if (!enabled) {
    return;
  }
  process.env.GDPR_HMAC_SALT_KEY = process.env.GDPR_HMAC_SALT_KEY ?? "wt353-test-salt";
  await cleanup();
  await seedTenant(ORG_A, "a", SITE_A);
  await seedTenant(ORG_B, "b", SITE_B);
  const first = await ingestPublicSubmission(submission({ idempotencyKey: "idem-first-" + RUN }));
  firstInquiryId = first.inquiryId;
});

afterAll(async () => {
  if (!enabled) {
    return;
  }
  await cleanup();
  await prisma.$disconnect();
});

describe.skipIf(!enabled)("Public inquiry ingestion", () => {
  it("creates exactly one inquiry for a retried idempotency key", async () => {
    const key = "idem-duplicate-" + RUN;
    const first = await ingestPublicSubmission(submission({ idempotencyKey: key }));
    const second = await ingestPublicSubmission(submission({ idempotencyKey: key }));
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.inquiryId).toBe(first.inquiryId);
    const rows = await prisma.cmsInquiry.findMany({ where: { siteId: SITE_A, idempotencyKey: key } });
    expect(rows).toHaveLength(1);
    const events = await prisma.cmsInquiryEvent.findMany({ where: { inquiryId: first.inquiryId } });
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("cms.inquiry.received");
  });

  it("quarantines a bot without revealing the detection and stores one-way hashes", async () => {
    const result = await ingestPublicSubmission(
      submission({ idempotencyKey: "idem-bot-" + RUN, honeypot: "https://spam.example" })
    );
    const row = await prisma.cmsInquiry.findUniqueOrThrow({ where: { id: result.inquiryId } });
    expect(row.status).toBe("SPAM");
    expect(row.spamVerdict).toBe("HONEYPOT");
    expect(Object.keys(result)).not.toContain("status");
    expect(row.emailHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.submitterHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("declares 365-day retention on every stored inquiry", async () => {
    const row = await prisma.cmsInquiry.findUniqueOrThrow({ where: { id: firstInquiryId } });
    const days = Math.round(
      (row.retentionExpiresAt.getTime() - row.createdAt.getTime()) / 86_400_000
    );
    expect(days).toBe(365);
  });
});

describe.skipIf(!enabled)("Inquiry intake guards", () => {
  it("refuses password, card and one-time-code field names", async () => {
    const fields = ["password", "card_number", "otp"];
    const outcomes = await Promise.all(
      fields.map((field) =>
        ingestPublicSubmission(
          submission({
            idempotencyKey: "idem-sensitive-" + field + "-" + RUN,
            payload: payload({ [field]: "secret-value" }),
          })
        ).then(
          () => null,
          (error: unknown) => error
        )
      )
    );
    for (const outcome of outcomes) {
      expect(outcome).toMatchObject({ code: "VALIDATION_FAILED" });
    }
  });

  it("refuses a submission for a site that does not exist", async () => {
    await expect(
      ingestPublicSubmission(
        submission({
          siteId: "site_missing_" + RUN,
          idempotencyKey: "idem-missing-" + RUN,
        })
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a payload above the 64KB cap", async () => {
    await expect(
      ingestPublicSubmission(
        submission({
          idempotencyKey: "idem-large-" + RUN,
          payload: payload({ message: "x".repeat(70_000) }),
        })
      )
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("sends no notification: only the inquiry and its durable event exist", async () => {
    const outboxBefore = await prisma.outboxEvent.count();
    const result = await ingestPublicSubmission(submission({ idempotencyKey: "idem-notify-" + RUN }));
    const outboxAfter = await prisma.outboxEvent.count();
    expect(outboxAfter).toBe(outboxBefore);
    expect(await prisma.cmsInquiryEvent.count({ where: { inquiryId: result.inquiryId } })).toBe(1);
  });

});

describe.skipIf(!enabled)("Tenant inquiry reads and PII", () => {
  it("hides contact fields without a PII reveal and audits the reveal", async () => {
    const hidden = await getTenantInquiry({
      organizationId: ORG_A,
      inquiryId: firstInquiryId,
      revealPii: false,
      actorUserId: "usr_wt353_actor",
    });
    expect(hidden?.contact).toBeNull();
    expect(hidden?.contactRedacted).toBe(true);
    const before = await prisma.cmsAuditTrail.count({
      where: { organizationId: ORG_A, entityId: firstInquiryId, action: "INQUIRY_PII_VIEWED" },
    });
    const revealed = await getTenantInquiry({
      organizationId: ORG_A,
      inquiryId: firstInquiryId,
      revealPii: true,
      actorUserId: "usr_wt353_actor",
    });
    expect(revealed?.contact?.email).toBe("jane.doe@example.org");
    const after = await prisma.cmsAuditTrail.count({
      where: { organizationId: ORG_A, entityId: firstInquiryId, action: "INQUIRY_PII_VIEWED" },
    });
    expect(after).toBe(before + 1);
  });

  it("reports another workspace's inquiry as not found", async () => {
    expect(await getTenantInquiry({
      organizationId: ORG_B,
      inquiryId: firstInquiryId,
      revealPii: false,
      actorUserId: "usr_other",
    })).toBeNull();
    expect(await changeTenantInquiryStatus({
      organizationId: ORG_B,
      inquiryId: firstInquiryId,
      status: "ARCHIVED",
      actorUserId: "usr_other",
    })).toBeNull();
    const page = await listTenantInquiries({ organizationId: ORG_B, limit: 20 });
    expect(page.items).toHaveLength(0);
  });
});

describe.skipIf(!enabled)("Inquiry status workflow", () => {
  it("moves NEW -> READ -> ARCHIVED and refuses a terminal transition", async () => {
    const read = await changeTenantInquiryStatus({
      organizationId: ORG_A,
      inquiryId: firstInquiryId,
      status: "READ",
      actorUserId: "usr_wt353_actor",
    });
    expect(read?.status).toBe("READ");
    const archived = await changeTenantInquiryStatus({
      organizationId: ORG_A,
      inquiryId: firstInquiryId,
      status: "ARCHIVED",
      actorUserId: "usr_wt353_actor",
    });
    expect(archived?.status).toBe("ARCHIVED");
    await expect(
      changeTenantInquiryStatus({
        organizationId: ORG_A,
        inquiryId: firstInquiryId,
        status: "READ",
        actorUserId: "usr_wt353_actor",
      })
    ).rejects.toMatchObject({ code: "INQUIRY_STATUS_CONFLICT" });
    const audits = await prisma.cmsAuditTrail.count({
      where: { organizationId: ORG_A, entityId: firstInquiryId, action: "INQUIRY_STATUS_CHANGED" },
    });
    expect(audits).toBe(2);
  });

  it("counts unread NEW inquiries only", async () => {
    const before = await countTenantUnreadInquiries(ORG_A);
    await ingestPublicSubmission(submission({ idempotencyKey: "idem-unread-" + RUN }));
    expect(await countTenantUnreadInquiries(ORG_A)).toBe(before + 1);
  });

});

describe.skipIf(!enabled)("Inquiry retention and erasure", () => {
  it("erases an inquiry before retention and audits the erasure", async () => {
    const created = await ingestPublicSubmission(submission({ idempotencyKey: "idem-erase-" + RUN }));
    const erased = await eraseTenantInquiry({
      organizationId: ORG_A,
      inquiryId: created.inquiryId,
      actorUserId: "usr_wt353_actor",
    });
    expect(erased).toBe(true);
    expect(await prisma.cmsInquiry.findUnique({ where: { id: created.inquiryId } })).toBeNull();
    expect(await prisma.cmsInquiryEvent.count({ where: { inquiryId: created.inquiryId } })).toBe(0);
    expect(
      await prisma.cmsAuditTrail.count({
        where: { organizationId: ORG_A, entityId: created.inquiryId, action: "INQUIRY_ERASED" },
      })
    ).toBe(1);
  });

  it("purges inquiries past their retention deadline", async () => {
    const created = await ingestPublicSubmission(submission({ idempotencyKey: "idem-purge-" + RUN }));
    await prisma.cmsInquiry.update({
      where: { id: created.inquiryId },
      data: { retentionExpiresAt: new Date(Date.now() - 86_400_000) },
    });
    const result = await runInquiryRetention({ batchSize: 10, maxBatches: 2 });
    expect(result.purged).toBeGreaterThanOrEqual(1);
    expect(await prisma.cmsInquiry.findUnique({ where: { id: created.inquiryId } })).toBeNull();
  });
});

describe.skipIf(!enabled)("Inquiry route capability gates", () => {
  function createApp(permissions: readonly string[], organizationId: string) {
    const app = new Hono<{ Variables: { user: { permissions: string[] }; userId: string; organizationId: string } }>();
    app.onError(globalErrorHandler);
    app.use("*", async (c, next) => {
      c.set("user", { permissions: [...permissions] });
      c.set("userId", "usr_wt353_actor");
      c.set("organizationId", organizationId);
      await next();
    });
    app.route("/api/v1/cms", createCmsInquiriesRouter());
    return app;
  }

  it("denies a PII reveal to a session with cms:leads:read only", async () => {
    const response = await createApp([PERMISSIONS.WEBSITE_BUILDER.LEADS_READ], ORG_A)
      .request("/api/v1/cms/inquiries/" + firstInquiryId + "?revealPii=true");
    expect(response.status).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe("CAPABILITY_DENIED");
  });

  it("returns contact fields with cms:leads:pii and records the audit row", async () => {
    const before = await prisma.cmsAuditTrail.count({
      where: {
        organizationId: ORG_A,
        entityId: firstInquiryId,
        action: "INQUIRY_PII_VIEWED",
      },
    });
    const response = await createApp(
      [PERMISSIONS.WEBSITE_BUILDER.LEADS_READ, PERMISSIONS.WEBSITE_BUILDER.LEADS_PII],
      ORG_A
    ).request("/api/v1/cms/inquiries/" + firstInquiryId + "?revealPii=true");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { inquiry: { contact: { email: string | null } } };
    };
    expect(body.data.inquiry.contact.email).toBe("jane.doe@example.org");
    const after = await prisma.cmsAuditTrail.count({
      where: {
        organizationId: ORG_A,
        entityId: firstInquiryId,
        action: "INQUIRY_PII_VIEWED",
      },
    });
    expect(after).toBe(before + 1);
  });

  it("returns 404 for another tenant's inquiry id", async () => {
    const response = await createApp([PERMISSIONS.WEBSITE_BUILDER.LEADS_READ], ORG_B)
      .request("/api/v1/cms/inquiries/" + firstInquiryId);
    expect(response.status).toBe(404);
  });
});
