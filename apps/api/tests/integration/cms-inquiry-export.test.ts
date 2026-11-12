import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { PERMISSIONS, type PermissionCode } from "@suite/core";
import { prisma } from "@suite/db";
import { CMS_AUDIT_ACTIONS } from "@suite/website-builder/audit";
import { globalErrorHandler } from "../../src/middleware/error-handler.js";
import { createCmsInquiriesRouter } from "../../src/routes/cms/inquiries.js";

const enabled = Boolean(process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL);
const RUN = Date.now().toString(36);
const ORG_A = "org_wt377_export_a_" + RUN;
const ORG_B = "org_wt377_export_b_" + RUN;
const SITE_A = "site_wt377_export_a_" + RUN;
const SITE_B = "site_wt377_export_b_" + RUN;
const INQUIRY_A = "inq_wt377_export_a_" + RUN;
const INQUIRY_A2 = "inq_wt377_export_a2_" + RUN;
const INQUIRY_B = "inq_wt377_export_b_" + RUN;

async function cleanup(): Promise<void> {
  const organizations = [ORG_A, ORG_B];
  await prisma.cmsInquiryEvent.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.cmsInquiry.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.cmsAuditTrail.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.cmsSite.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.organization.deleteMany({ where: { id: { in: organizations } } });
}

async function seedTenant(id: string, label: string, siteId: string): Promise<void> {
  await prisma.organization.create({
    data: { id, name: "WT377 export " + label, slug: "wt377-export-" + label + "-" + RUN },
  });
  await prisma.cmsSite.create({
    data: {
      id: siteId,
      organizationId: id,
      title: "WT377 export " + label,
      slug: "wt377-export-site-" + label + "-" + RUN,
      status: "PUBLISHED",
    },
  });
}

async function seedInquiry(input: {
  readonly id: string;
  readonly organizationId: string;
  readonly siteId: string;
  readonly name: string;
  readonly email: string;
  readonly message: string;
  readonly status?: "NEW" | "READ";
  readonly retentionExpiresAt?: Date;
}): Promise<void> {
  await prisma.cmsInquiry.create({
    data: {
      id: input.id,
      organizationId: input.organizationId,
      siteId: input.siteId,
      blockId: "block_contact_" + RUN,
      idempotencyKey: "idem-" + input.id,
      payloadJson: { name: input.name, email: input.email, message: input.message },
      status: input.status ?? "NEW",
      ...(input.retentionExpiresAt === undefined
        ? {}
        : { retentionExpiresAt: input.retentionExpiresAt }),
    },
  });
}

interface Variables {
  user: { permissions?: string[] };
  userId?: string;
  organizationId?: string;
}

function createApp(permissions: readonly PermissionCode[], organizationId: string) {
  const app = new Hono<{ Variables: Variables }>();
  app.onError(globalErrorHandler);
  app.use("*", async (c, next) => {
    c.set("user", { permissions: [...permissions] });
    c.set("userId", "usr_wt377_export_actor");
    c.set("organizationId", organizationId);
    await next();
  });
  app.route("/api/v1/cms", createCmsInquiriesRouter());
  return app;
}

async function exportRequest(
  app: Hono<{ Variables: Variables }>,
  query = ""
): Promise<Response> {
  return app.request("/api/v1/cms/inquiries/export" + query);
}

beforeAll(async () => {
  if (!enabled) {
    return;
  }
  await cleanup();
  await seedTenant(ORG_A, "a", SITE_A);
  await seedTenant(ORG_B, "b", SITE_B);
  await seedInquiry({
    id: INQUIRY_A,
    organizationId: ORG_A,
    siteId: SITE_A,
    name: "Jane Doe",
    email: "jane.doe@example.org",
    message: "Please call me about a booking.",
  });
  await seedInquiry({
    id: INQUIRY_A2,
    organizationId: ORG_A,
    siteId: SITE_A,
    name: "=SUM(A1:A2)",
    email: "formula@example.org",
    message: "Formula guard fixture.",
    status: "READ",
  });
  await seedInquiry({
    id: INQUIRY_B,
    organizationId: ORG_B,
    siteId: SITE_B,
    name: "Other Tenant",
    email: "other@example.org",
    message: "Another workspace's enquiry.",
  });
});

afterAll(async () => {
  if (!enabled) {
    return;
  }
  await cleanup();
  await prisma.$disconnect();
});

describe.skipIf(!enabled)("Inquiry CSV export", () => {
  it("exports only the caller's rows and writes an audit row for the site", async () => {
    const response = await exportRequest(
      createApp(
        [PERMISSIONS.WEBSITE_BUILDER.LEADS_READ, PERMISSIONS.WEBSITE_BUILDER.LEADS_PII],
        ORG_A
      )
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    const csv = await response.text();
    expect(csv).toContain('"jane.doe@example.org"');
    expect(csv).toContain('"Please call me about a booking."');
    expect(csv).not.toContain("other@example.org");
    expect(csv).not.toContain(INQUIRY_B);

    const audit = await prisma.cmsAuditTrail.findFirst({
      where: {
        organizationId: ORG_A,
        siteId: SITE_A,
        action: CMS_AUDIT_ACTIONS.INQUIRY_EXPORTED,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.changesJson).toMatchObject({ exportedCount: 2 });
  });

  it("denies the export without cms:leads:pii and writes no audit row", async () => {
    const before = await prisma.cmsAuditTrail.count({
      where: { organizationId: ORG_A, action: CMS_AUDIT_ACTIONS.INQUIRY_EXPORTED },
    });
    const response = await exportRequest(
      createApp([PERMISSIONS.WEBSITE_BUILDER.LEADS_READ], ORG_A)
    );
    expect(response.status).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe("CAPABILITY_DENIED");
    expect(
      await prisma.cmsAuditTrail.count({
        where: { organizationId: ORG_A, action: CMS_AUDIT_ACTIONS.INQUIRY_EXPORTED },
      })
    ).toBe(before);
  });

});

describe.skipIf(!enabled)("Inquiry CSV export filters and safety", () => {
  it("honours the status filter and excludes retention-expired rows", async () => {
    await seedInquiry({
      id: "inq_wt377_expired_" + RUN,
      organizationId: ORG_A,
      siteId: SITE_A,
      name: "Expired Lead",
      email: "expired@example.org",
      message: "Past the retention deadline.",
      retentionExpiresAt: new Date(Date.now() - 86_400_000),
    });
    const response = await exportRequest(
      createApp(
        [PERMISSIONS.WEBSITE_BUILDER.LEADS_READ, PERMISSIONS.WEBSITE_BUILDER.LEADS_PII],
        ORG_A
      ),
      "?status=READ"
    );
    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain(INQUIRY_A2);
    expect(csv).toContain('"READ"');
    expect(csv).not.toContain(INQUIRY_A);
    expect(csv).not.toContain('"NEW"');
    expect(csv).not.toContain("expired@example.org");
  });

  it("neutralises a spreadsheet formula in an exported cell", async () => {
    const response = await exportRequest(
      createApp(
        [PERMISSIONS.WEBSITE_BUILDER.LEADS_READ, PERMISSIONS.WEBSITE_BUILDER.LEADS_PII],
        ORG_A
      )
    );
    const csv = await response.text();
    expect(csv).toContain('"\'=SUM(A1:A2)"');
  });

  it("refuses an unknown status filter with RFC 7807 problem details", async () => {
    const response = await exportRequest(
      createApp(
        [PERMISSIONS.WEBSITE_BUILDER.LEADS_READ, PERMISSIONS.WEBSITE_BUILDER.LEADS_PII],
        ORG_A
      ),
      "?status=DELETED"
    );
    expect(response.status).toBe(422);
    const body = (await response.json()) as { code: string; type: string };
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(body.type).toBe("/errors/validation-failed");
  });
});
