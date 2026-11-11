import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const LIBRARY_SQL = readFileSync(
  resolve(
    process.cwd(),
    "../../packages/db/prisma/schema/migrations/20261111020000_media_library/migration.sql"
  ),
  "utf8"
);

const QUOTA_SQL = readFileSync(
  resolve(
    process.cwd(),
    "../../packages/db/prisma/schema/migrations/20261111021000_media_storage_quota/migration.sql"
  ),
  "utf8"
);

describe("media library migration", () => {
  it("sets a lock timeout for forward-only DDL", () => {
    expect(LIBRARY_SQL).toContain("SET lock_timeout = '5s';");
    expect(QUOTA_SQL).toContain("SET lock_timeout = '5s';");
  });

  it("creates both tables in public with the media_ prefix", () => {
    expect(LIBRARY_SQL).toContain('CREATE TABLE "media_assets"');
    expect(LIBRARY_SQL).toContain('CREATE TABLE "media_usages"');
    expect(LIBRARY_SQL).toContain('"organizationId" TEXT NOT NULL');
  });

  it("deduplicates a checksum per tenant and a usage per reference", () => {
    expect(LIBRARY_SQL).toContain(
      'CREATE UNIQUE INDEX "media_assets_organizationId_checksum_key"'
    );
    expect(LIBRARY_SQL).toContain(
      'CREATE UNIQUE INDEX "media_usages_assetId_appId_resourceType_resourceId_subKey_key"'
    );
    expect(LIBRARY_SQL).toContain("ON DELETE RESTRICT");
  });

  it("enables forced RLS keyed on the tenant context setting", () => {
    expect(LIBRARY_SQL).toContain(
      'ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;'
    );
    expect(LIBRARY_SQL).toContain(
      'ALTER TABLE "media_assets" FORCE ROW LEVEL SECURITY;'
    );
    expect(LIBRARY_SQL).toContain(
      'ALTER TABLE "media_usages" ENABLE ROW LEVEL SECURITY;'
    );
    expect(LIBRARY_SQL).toContain(
      "CURRENT_SETTING('app.current_organization_id', true)"
    );
    expect(LIBRARY_SQL).toContain('CREATE POLICY "media_assets_tenant_isolation"');
    expect(LIBRARY_SQL).toContain('CREATE POLICY "media_usages_tenant_isolation"');
  });

  it("revokes PUBLIC and grants app_tenant only its tenant rows", () => {
    expect(LIBRARY_SQL).toContain(
      'REVOKE ALL ON TABLE "media_assets" FROM PUBLIC;'
    );
    expect(LIBRARY_SQL).toContain(
      'REVOKE ALL ON TABLE "media_usages" FROM PUBLIC;'
    );
    expect(LIBRARY_SQL).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "media_assets" TO app_tenant;'
    );
    expect(LIBRARY_SQL).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "media_usages" TO app_tenant;'
    );
  });

  it("declares retention for both tables", () => {
    expect(LIBRARY_SQL).toContain('COMMENT ON TABLE "media_assets"');
    expect(LIBRARY_SQL).toContain('COMMENT ON TABLE "media_usages"');
  });
});

describe("media storage quota migration", () => {
  it("measures ACTIVE media bytes per tenant, counting deduped rows once", () => {
    expect(QUOTA_SQL).toContain("WHEN 'media.storage' THEN (");
    expect(QUOTA_SQL).toContain('coalesce(sum(a."sizeBytes"), 0)::bigint');
    expect(QUOTA_SQL).toContain('a."status" = \'ACTIVE\'');
  });

  it("removes the unmeasurable-storage refusal from the versioned gate", () => {
    expect(QUOTA_SQL).toContain(
      "CREATE OR REPLACE FUNCTION platform.fn_set_quota_versioned("
    );
    expect(QUOTA_SQL).not.toContain("v_key = 'media.storage'");
    expect(QUOTA_SQL).toContain(
      "GRANT EXECUTE ON FUNCTION platform.fn_set_quota_versioned(text, text, bigint, boolean, text, text, text) TO app_platform"
    );
  });
});
