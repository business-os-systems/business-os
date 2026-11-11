-- T-09 (#354): per-site appearance snapshot
--
-- One forward-only unit (DB-4): DDL, grants and RLS for cms.cms_site_appearances.
-- The table stores the site's own complete token snapshot, its draft and
-- published copies and the source theme identity used by reset-to-theme. No
-- backfill rewrites a row here (DB-5); a site created before this migration
-- reads the canonical defaults until its first appearance write.
--
-- Additive and re-runnable: every statement is guarded. The existing
-- cms_site_appearance row is tenant-owned, so the tenant identity receives
-- DML and row-level security keyed on app.current_organization_id (DB-2).

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "cms"."cms_site_appearances" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "draftTokens" JSONB NOT NULL,
    "publishedTokens" JSONB NOT NULL,
    "sourceTokens" JSONB NOT NULL,
    "sourceItemId" VARCHAR(64),
    "sourceVersion" INTEGER,
    "concurrencyVersion" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_site_appearances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cms_site_appearances_siteId_key"
    ON "cms"."cms_site_appearances" ("siteId");

CREATE UNIQUE INDEX IF NOT EXISTS "cms_site_appearances_siteId_organizationId_key"
    ON "cms"."cms_site_appearances" ("siteId", "organizationId");

CREATE INDEX IF NOT EXISTS "cms_site_appearances_organizationId_siteId_idx"
    ON "cms"."cms_site_appearances" ("organizationId", "siteId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'cms_site_appearances_siteId_organizationId_fkey'
          AND conrelid = 'cms.cms_site_appearances'::regclass
    ) THEN
        ALTER TABLE "cms"."cms_site_appearances"
            ADD CONSTRAINT "cms_site_appearances_siteId_organizationId_fkey"
            FOREIGN KEY ("siteId", "organizationId")
            REFERENCES "cms"."cms_sites"("id", "organizationId")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

REVOKE ALL ON TABLE "cms"."cms_site_appearances" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_site_appearances" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."cms_site_appearances" TO app_tenant;

ALTER TABLE "cms"."cms_site_appearances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cms"."cms_site_appearances" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'cms'
          AND tablename = 'cms_site_appearances'
          AND policyname = 'cms_site_appearances_tenant_isolation'
    ) THEN
        CREATE POLICY "cms_site_appearances_tenant_isolation"
            ON "cms"."cms_site_appearances"
            FOR ALL
            USING ("organizationId" = CURRENT_SETTING('app.current_organization_id', true))
            WITH CHECK ("organizationId" = CURRENT_SETTING('app.current_organization_id', true));
    END IF;
END $$;

COMMENT ON TABLE "cms"."cms_site_appearances"
    IS 'A site-owned appearance token snapshot (draft and published) with its source theme identity; reset restores sourceTokens and a platform theme change never rewrites this row.';
