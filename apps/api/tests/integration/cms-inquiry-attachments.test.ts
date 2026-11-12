import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { prisma } from "@suite/db";
import { ingestPublicSubmission } from "../../src/services/cms/form-ingestion.js";
import { clearRateLimitStore } from "../../src/middleware/rate-limit.js";

// The intake path hashes the submitter with GDPR_HMAC_SALT_KEY and signs with
// BETTER_AUTH_SECRET. Set deterministic values when the environment omits them
// so the suite does not depend on another file having set them first.
process.env.GDPR_HMAC_SALT_KEY ??= "suite-test-gdpr-hmac-salt-key-32chars";
process.env.BETTER_AUTH_SECRET ??= "suite-test-attachments-secret-32-chars";

const enabled = Boolean(process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL);
const RUN = Date.now().toString(36);
const ORG = "org_wt381_attach_" + RUN;
const SITE = "site_wt381_attach_" + RUN;
const BLOCK = "block_contact_" + RUN;

async function cleanup(): Promise<void> {
  await prisma.cmsInquiryEvent.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsInquiry.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsAuditTrail.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsPageContent.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsPage.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsSite.deleteMany({ where: { organizationId: ORG } });
  await prisma.organization.deleteMany({ where: { id: ORG } });
}

function submission(attachments: Record<string, string | number>[]) {
  return {
    siteId: SITE,
    blockId: BLOCK,
    idempotencyKey: "idem-attach-" + RUN,
    payload: { name: "Jane Doe", email: "jane.doe@example.org", message: "Booking please" },
    attachments,
    turnstileToken: "valid-turnstile-token",
    honeypot: null,
    clientIp: "203.0.113.9",
    userAgent: "vitest",
  };
}

beforeAll(async () => {
  if (!enabled) {
    return;
  }
  // Form submissions share the per-IP intake bucket (20/min); a full coverage
  // run must not answer this suite's first submission with 429.
  await clearRateLimitStore("rl:storefront-inquiries");
  await prisma.organization.create({
    data: { id: ORG, name: "WT381 attachments", slug: "wt381-attach-" + RUN },
  });
  await prisma.cmsSite.create({
    data: {
      id: SITE,
      organizationId: ORG,
      title: "WT381 attachments",
      slug: "wt381-attach-" + RUN,
      status: "PUBLISHED",
    },
  });
  await prisma.cmsPage.create({
    data: {
      organizationId: ORG,
      siteId: SITE,
      title: "Contact",
      slug: "/contact",
      status: "PUBLISHED",
      isHomePage: true,
      content: {
        create: {
          publishedAst: {
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
                      fields: [{ id: "f_name", name: "name", label: "Name", type: "text", required: true }],
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    },
  });
});

afterAll(async () => {
  if (!enabled) {
    return;
  }
  await cleanup();
});

describe.skipIf(!enabled)("public inquiry attachments", () => {
  it("refuses an attachment before anything is stored", async () => {
    await expect(
      ingestPublicSubmission(
        submission([
          { name: "rates.pdf", url: "https://files.example.test/rates.pdf", size: 12 },
        ])
      )
    ).rejects.toMatchObject({
      status: 422,
      code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
      detail: "Published forms do not accept file attachments.",
    });

    const stored = await prisma.cmsInquiry.count({ where: { organizationId: ORG } });
    expect(stored).toBe(0);
    const audit = await prisma.cmsAuditTrail.count({
      where: { organizationId: ORG, action: "INQUIRY_PII_VIEWED" },
    });
    expect(audit).toBe(0);
  });

  it("still accepts a submission without attachments", async () => {
    const result = await ingestPublicSubmission(submission([]));

    expect(result.inquiryId.length).toBeGreaterThan(0);
    const stored = await prisma.cmsInquiry.count({ where: { organizationId: ORG } });
    expect(stored).toBe(1);
  });
});
