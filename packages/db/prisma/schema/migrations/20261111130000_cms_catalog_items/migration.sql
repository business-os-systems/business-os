-- ==============================================================================
-- Website Builder application catalog (P-03, #342, T010/T011)
--
-- Sections, templates and themes become versioned catalog records. This slice
-- deliberately keeps the two tables in the public schema so it can be tested in
-- isolation; T-01 (#346) relocates every cms_* table into the dedicated cms
-- schema with its own grants and RLS. The migration is forward-only, sets a
-- lock timeout and never rewrites an existing row.
--
-- DB-3: both tables keep the cms_ prefix, the foreign key stays inside public
-- and no reverse relation is added to a core model.
-- DB-5: DDL only; no backfill.
-- ==============================================================================

SET lock_timeout = '5s';

-- CreateEnum
CREATE TYPE "public"."CmsCatalogKind" AS ENUM ('SECTION', 'TEMPLATE', 'THEME');

-- CreateEnum
CREATE TYPE "public"."CmsCatalogScope" AS ENUM ('GLOBAL', 'TENANT');

-- CreateEnum
CREATE TYPE "public"."CmsCatalogStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED', 'DISABLED', 'RETIRED');

-- CreateTable
CREATE TABLE "public"."cms_catalog_items" (
    "id" TEXT NOT NULL,
    "kind" "public"."CmsCatalogKind" NOT NULL,
    "scope" "public"."CmsCatalogScope" NOT NULL DEFAULT 'GLOBAL',
    "organizationId" TEXT,
    "name" VARCHAR(191) NOT NULL,
    "slug" VARCHAR(191) NOT NULL,
    "category" VARCHAR(64) NOT NULL,
    "industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "definition" JSONB NOT NULL,
    "previewRef" TEXT,
    "flagKey" VARCHAR(64),
    "targeting" JSONB NOT NULL DEFAULT '{}',
    "status" "public"."CmsCatalogStatus" NOT NULL DEFAULT 'DRAFT',
    "contractVersion" VARCHAR(32) NOT NULL DEFAULT '2026-03',
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "draftVersion" INTEGER,
    "concurrencyVersion" INTEGER NOT NULL DEFAULT 1,
    "previewedAt" TIMESTAMPTZ(6),
    "previewedHash" VARCHAR(64),
    "previewedBy" VARCHAR(191),
    "publishedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdBy" VARCHAR(191) NOT NULL,
    "updatedBy" VARCHAR(191) NOT NULL,

    CONSTRAINT "cms_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cms_catalog_item_versions" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "status" "public"."CmsCatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "contractVersion" VARCHAR(32) NOT NULL DEFAULT '2026-03',
    "changeNote" VARCHAR(500),
    "previewedAt" TIMESTAMPTZ(6),
    "previewedHash" VARCHAR(64),
    "previewedBy" VARCHAR(191),
    "publishedAt" TIMESTAMPTZ(6) NOT NULL,
    "publishedBy" VARCHAR(191) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" VARCHAR(191) NOT NULL,

    CONSTRAINT "cms_catalog_item_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cms_catalog_items_kind_status_idx" ON "public"."cms_catalog_items"("kind", "status");

-- CreateIndex
CREATE INDEX "cms_catalog_items_scope_organizationId_idx" ON "public"."cms_catalog_items"("scope", "organizationId");

-- CreateIndex
CREATE INDEX "cms_catalog_items_updatedAt_id_idx" ON "public"."cms_catalog_items"("updatedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cms_catalog_items_kind_scope_organizationId_slug_key" ON "public"."cms_catalog_items"("kind", "scope", "organizationId", "slug");

-- A NULL organizationId is distinct in a PostgreSQL unique index, so the
-- composite key above cannot keep global slugs unique. The partial index does.
CREATE UNIQUE INDEX "cms_catalog_items_global_kind_slug_key"
    ON "public"."cms_catalog_items"("kind", "slug")
    WHERE "organizationId" IS NULL;

-- CreateIndex
CREATE INDEX "cms_catalog_item_versions_itemId_status_idx" ON "public"."cms_catalog_item_versions"("itemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cms_catalog_item_versions_itemId_version_key" ON "public"."cms_catalog_item_versions"("itemId", "version");

-- AddForeignKey
ALTER TABLE "public"."cms_catalog_item_versions" ADD CONSTRAINT "cms_catalog_item_versions_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "public"."cms_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Lifecycle and version invariants. These are business rules the API also
-- enforces; the database keeps them true for every writer.
ALTER TABLE "public"."cms_catalog_items"
    ADD CONSTRAINT "cms_catalog_items_scope_organization_check" CHECK (
        ("scope" = 'GLOBAL' AND "organizationId" IS NULL)
        OR ("scope" = 'TENANT' AND "organizationId" IS NOT NULL)
    ),
    ADD CONSTRAINT "cms_catalog_items_version_order_check" CHECK (
        "currentVersion" >= 0
        AND ("draftVersion" IS NULL OR "draftVersion" > "currentVersion")
    ),
    ADD CONSTRAINT "cms_catalog_items_concurrency_check" CHECK ("concurrencyVersion" >= 1);

ALTER TABLE "public"."cms_catalog_item_versions"
    ADD CONSTRAINT "cms_catalog_item_versions_version_positive_check" CHECK ("version" >= 1);

-- Published history is immutable (T011). The API never updates a version row;
-- this trigger makes a future accidental write fail instead of rewriting it.
CREATE OR REPLACE FUNCTION "public"."cms_catalog_item_versions_reject_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'cms_catalog_item_versions rows are immutable'
        USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER "cms_catalog_item_versions_immutable"
    BEFORE UPDATE ON "public"."cms_catalog_item_versions"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."cms_catalog_item_versions_reject_update"();

-- The Platform control plane (app_platform) owns catalog administration. It
-- never receives DELETE: a retired item remains resolvable and is never
-- deleted (FR-004). Tenant read grants and RLS land with T-01/T015.
GRANT USAGE ON TYPE "public"."CmsCatalogKind" TO app_platform;
GRANT USAGE ON TYPE "public"."CmsCatalogScope" TO app_platform;
GRANT USAGE ON TYPE "public"."CmsCatalogStatus" TO app_platform;

GRANT SELECT, INSERT, UPDATE ON "public"."cms_catalog_items" TO app_platform;
GRANT SELECT, INSERT ON "public"."cms_catalog_item_versions" TO app_platform;

COMMENT ON TABLE "public"."cms_catalog_items"
    IS 'Website Builder catalog item (section, template or theme) with its working definition and lifecycle.';
COMMENT ON TABLE "public"."cms_catalog_item_versions"
    IS 'Immutable published catalog snapshots. Retired items and every published version remain resolvable.';
COMMENT ON COLUMN "public"."cms_catalog_items"."currentVersion"
    IS 'Latest published version; zero until the first publish.';
COMMENT ON COLUMN "public"."cms_catalog_items"."draftVersion"
    IS 'Pending draft version number, materialised on publish; null when no draft exists.';
COMMENT ON COLUMN "public"."cms_catalog_items"."previewedHash"
    IS 'SHA-256 of the previewed definition; publish requires it to match the draft.';
