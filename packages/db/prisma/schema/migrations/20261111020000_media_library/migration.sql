-- ==============================================================================
-- Shared media library (#344, FR-050 to FR-052, FR-119 to FR-122)
--
-- Physical placement: public schema, "media" owner, "media_" table prefix
-- (DB-3, DB-4). Tenant isolation is a scalar organizationId plus RLS keyed on
-- the transaction-local app.current_organization_id (DB-2). No core model is
-- modified and no foreign key crosses a schema boundary.
--
-- DDL only. Grants and policies ship in this same unit so a drifted database
-- cannot expose every tenant; the usage view and the enforceable storage quota
-- live in 20261111021000_media_storage_quota.
-- ==============================================================================

SET lock_timeout = '5s';

-- ==============================================================================
-- 1. Enums
-- ==============================================================================
CREATE TYPE "MediaAssetKind" AS ENUM ('IMAGE');
CREATE TYPE "MediaAssetStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "MediaUsageStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- ==============================================================================
-- 2. Tables
-- ==============================================================================
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "MediaAssetKind" NOT NULL DEFAULT 'IMAGE',
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "storageKey" VARCHAR(512) NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "status" "MediaAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" VARCHAR(191) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "archivedAt" TIMESTAMPTZ(6),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "media_usages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "appId" VARCHAR(64) NOT NULL,
    "resourceType" VARCHAR(64) NOT NULL,
    "resourceId" VARCHAR(128) NOT NULL,
    "subKey" VARCHAR(64) NOT NULL DEFAULT '',
    "status" "MediaUsageStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "media_usages_pkey" PRIMARY KEY ("id")
);

-- Identical bytes are one asset per tenant: checksum dedupe is the storage
-- accounting rule, so the quota view can sum rows and count each file once.
CREATE UNIQUE INDEX "media_assets_organizationId_checksum_key"
    ON "media_assets"("organizationId", "checksum");
CREATE UNIQUE INDEX "media_assets_storageKey_key"
    ON "media_assets"("storageKey");
CREATE INDEX "media_assets_organizationId_status_createdAt_idx"
    ON "media_assets"("organizationId", "status", "createdAt");
CREATE INDEX "media_assets_organizationId_kind_status_idx"
    ON "media_assets"("organizationId", "kind", "status");
CREATE INDEX "media_assets_organizationId_fileName_idx"
    ON "media_assets"("organizationId", "fileName");

CREATE UNIQUE INDEX "media_usages_assetId_appId_resourceType_resourceId_subKey_key"
    ON "media_usages"("assetId", "appId", "resourceType", "resourceId", "subKey");
CREATE INDEX "media_usages_organizationId_assetId_status_idx"
    ON "media_usages"("organizationId", "assetId", "status");
CREATE INDEX "media_usages_organizationId_appId_resourceType_resourceId_idx"
    ON "media_usages"("organizationId", "appId", "resourceType", "resourceId");

-- An asset row cannot disappear while a usage row still references it.
ALTER TABLE "media_usages"
    ADD CONSTRAINT "media_usages_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "media_assets"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ==============================================================================
-- 3. Row-level security keyed on the verified tenant context
-- ==============================================================================
ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media_assets" FORCE ROW LEVEL SECURITY;
ALTER TABLE "media_usages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media_usages" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'media_assets'
          AND policyname = 'media_assets_tenant_isolation'
    ) THEN
        CREATE POLICY "media_assets_tenant_isolation" ON "media_assets"
            FOR ALL
            USING ("organizationId" = CURRENT_SETTING('app.current_organization_id', true))
            WITH CHECK ("organizationId" = CURRENT_SETTING('app.current_organization_id', true));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'media_usages'
          AND policyname = 'media_usages_tenant_isolation'
    ) THEN
        CREATE POLICY "media_usages_tenant_isolation" ON "media_usages"
            FOR ALL
            USING ("organizationId" = CURRENT_SETTING('app.current_organization_id', true))
            WITH CHECK ("organizationId" = CURRENT_SETTING('app.current_organization_id', true));
    END IF;
END $$;

-- ==============================================================================
-- 4. Explicit grants: PUBLIC revoked, app_tenant gets tenant-row DML only.
--    The migration owner keeps ownership; app_platform is untouched.
-- ==============================================================================
REVOKE ALL ON TABLE "media_assets" FROM PUBLIC;
REVOKE ALL ON TABLE "media_usages" FROM PUBLIC;
REVOKE ALL ON TABLE "media_assets" FROM app_tenant;
REVOKE ALL ON TABLE "media_usages" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "media_assets" TO app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "media_usages" TO app_tenant;

-- ==============================================================================
-- 5. Declared retention (OP-6). Enforced by the media delete path; tenant
--    offboarding archives then deletes through the owner procedure.
-- ==============================================================================
COMMENT ON TABLE "media_assets" IS
    'Tenant media objects (FR-050 to FR-052). Retention: life of the tenant, or immediately when deleted while no PUBLISHED usage exists; owner offboarding archives then deletes.';
COMMENT ON TABLE "media_usages" IS
    'Application references to a media asset by identity (FR-120). Retention: life of the referencing content; removed when the content reference is removed.';
