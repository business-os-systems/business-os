import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@suite/db";
import { CMS_AUDIT_ACTIONS } from "../src/audit/actions.js";
import { exportTenantInquiries } from "../src/inquiries/export.js";

const enabled = Boolean(process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL);
const RUN = Date.now().toString(36);
const ORG = "org_wt377_module_export_" + RUN;
const SITE_A = "site_wt377_module_export_a_" + RUN;
const SITE_B = "site_wt377_module_export_b_" + RUN;
const ACTOR = "usr_wt377_module_export";

async function cleanup(): Promise<void> {
  await prisma.cmsInquiryEvent.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsInquiry.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsAuditTrail.deleteMany({ where: { organizationId: ORG } });
  await prisma.cmsSite.deleteMany({ where: { organizationId: ORG } });
  await prisma.organization.deleteMany({ where: { id: ORG } });
}

async function seedInquiry(input: {
  readonly id: string;
  readonly siteId: string;
  readonly email: string;
  readonly status: "NEW" | "READ";
  readonly retentionExpiresAt?: Date;
}): Promise<void> {
  await prisma.cmsInquiry.create({
    data: {
      id: input.id,
      organizationId: ORG,
      siteId: input.siteId,
      blockId: "block_contact_" + RUN,
      idempotencyKey: "idem-" + input.id,
      payloadJson: { name: "Lead", email: input.email, message: "Please call me." },
      status: input.status,
      ...(input.retentionExpiresAt === undefined
        ? {}
        : { retentionExpiresAt: input.retentionExpiresAt }),
    },
  });
}

beforeAll(async () => {
  if (!enabled) {
    return;
  }
  await cleanup();
  await prisma.organization.create({
    data: { id: ORG, name: "WT377 module export", slug: "wt377-module-export-" + RUN },
  });
  await prisma.cmsSite.create({
    data: {
      id: SITE_A,
      organizationId: ORG,
      title: "Export site A",
      slug: "wt377-module-export-a-" + RUN,
      status: "PUBLISHED",
    },
  });
  await prisma.cmsSite.create({
    data: {
      id: SITE_B,
      organizationId: ORG,
      title: "Export site B",
      slug: "wt377-module-export-b-" + RUN,
      status: "PUBLISHED",
    },
  });
  await seedInquiry({
    id: "inq_wt377_module_a_new_" + RUN,
    siteId: SITE_A,
    email: "a-new@example.org",
    status: "NEW",
  });
  await seedInquiry({
    id: "inq_wt377_module_a_read_" + RUN,
    siteId: SITE_A,
    email: "a-read@example.org",
    status: "READ",
  });
  await seedInquiry({
    id: "inq_wt377_module_b_new_" + RUN,
    siteId: SITE_B,
    email: "b-new@example.org",
    status: "NEW",
  });
  await seedInquiry({
    id: "inq_wt377_module_expired_" + RUN,
    siteId: SITE_B,
    email: "expired@example.org",
    status: "NEW",
    retentionExpiresAt: new Date(Date.now() - 86_400_000),
  });
});

afterAll(async () => {
  if (!enabled) {
    return;
  }
  await cleanup();
  await prisma.$disconnect();
});

describe.skipIf(!enabled)("Tenant inquiry export", () => {
  it("exports every live row and audits one record per exported site", async () => {
    const result = await exportTenantInquiries({ organizationId: ORG, actorUserId: ACTOR });
    expect(result.rowCount).toBe(3);
    expect(result.filename).toMatch(/^inquiries-.*\.csv$/);
    expect(result.csv).toContain("a-new@example.org");
    expect(result.csv).toContain("a-read@example.org");
    expect(result.csv).toContain("b-new@example.org");
    expect(result.csv).not.toContain("expired@example.org");

    const audits = await prisma.cmsAuditTrail.findMany({
      where: { organizationId: ORG, action: CMS_AUDIT_ACTIONS.INQUIRY_EXPORTED },
      orderBy: { siteId: "asc" },
    });
    expect(audits).toHaveLength(2);
    expect(audits.map((audit) => audit.siteId)).toEqual([SITE_A, SITE_B]);
    expect(audits[0]?.changesJson).toMatchObject({ exportedCount: 2, siteFiltered: false });
    expect(audits[1]?.changesJson).toMatchObject({ exportedCount: 1, siteFiltered: false });
  });

  it("honours the status and site filters", async () => {
    const result = await exportTenantInquiries({
      organizationId: ORG,
      siteId: SITE_A,
      status: "READ",
      actorUserId: ACTOR,
    });
    expect(result.rowCount).toBe(1);
    expect(result.csv).toContain("a-read@example.org");
    expect(result.csv).not.toContain("a-new@example.org");
    expect(result.csv).not.toContain("b-new@example.org");

    const siteAudit = await prisma.cmsAuditTrail.findFirstOrThrow({
      where: { organizationId: ORG, siteId: SITE_A, action: CMS_AUDIT_ACTIONS.INQUIRY_EXPORTED },
      orderBy: { createdAt: "desc" },
    });
    expect(siteAudit.changesJson).toMatchObject({ exportedCount: 1, siteFiltered: true });
  });
});
