import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = resolve(
  process.cwd(),
  "../../packages/db/prisma/schema/migrations/20261111160000_cms_inquiries/migration.sql"
);
const SCHEMA = resolve(process.cwd(), "../../packages/db/prisma/schema/cms.prisma");

const sql = readFileSync(MIGRATION, "utf8");
const prisma = readFileSync(SCHEMA, "utf8");

describe("Inquiry migration (T-08 #353, DB-2/DB-4/DB-5, FR-049)", () => {
  it("sets lock_timeout before the first DDL statement", () => {
    const lockIndex = sql.indexOf("SET lock_timeout = '5s';");
    const firstDdl = sql.indexOf("ALTER TYPE");
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(firstDdl).toBeGreaterThan(lockIndex);
  });

  it("renames the prototype table instead of creating a parallel one", () => {
    expect(sql).toContain('ALTER TABLE cms."cms_form_submissions" RENAME TO "cms_inquiries"');
    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS cms."cms_inquiries"');
  });

  it("keeps unique (siteId, idempotencyKey) and the organization boundary", () => {
    expect(prisma).toContain("@@unique([siteId, idempotencyKey])");
    expect(prisma).toContain("organizationId     String");
    expect(prisma).toContain('@@map("cms_inquiries")');
  });

  it("stores only the declared personal-data columns with 365-day retention", () => {
    expect(prisma).toContain("365 days");
    expect(sql).toContain("now() + interval '365 days'");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "retentionExpiresAt"');
    expect(sql).toContain('CHECK (pg_column_size("payloadJson") <= 65536)');
    expect(prisma).toContain('emailHash');
    expect(prisma).toContain('submitterHash');
  });

  it("grants app_tenant, revokes PUBLIC and forces row-level security", () => {
    expect(sql).toContain('REVOKE ALL ON TABLE cms."cms_inquiries" FROM PUBLIC;');
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE cms."cms_inquiries" TO app_tenant;'
    );
    expect(sql).toContain('ALTER TABLE cms."cms_inquiries" ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE cms."cms_inquiries" FORCE ROW LEVEL SECURITY;');
    expect(sql).toContain("CURRENT_SETTING('app.current_organization_id', true)");
  });

  it("declares the inquiry status vocabulary and append-only event", () => {
    expect(prisma).toContain("enum CmsInquiryStatus");
    for (const status of ["NEW", "READ", "ARCHIVED", "SPAM"]) {
      expect(prisma).toContain(status);
    }
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS cms."cms_inquiry_events"');
    expect(sql).toContain('GRANT SELECT, INSERT ON TABLE cms."cms_inquiry_events" TO app_tenant;');
  });

  it("retires the prototype SECURITY DEFINER ingestion helper", () => {
    expect(sql).toContain("DROP FUNCTION IF EXISTS public.cms_ingest_form_submission");
    expect(sql).toContain("public.cms_public_site_organization");
  });

  it("declares a 365-day purge helper with an erasure-capable runtime grant", () => {
    expect(sql).toContain("public.cms_purge_expired_inquiries");
    expect(sql).toContain('i."retentionExpiresAt" <= now()');
  });
});
