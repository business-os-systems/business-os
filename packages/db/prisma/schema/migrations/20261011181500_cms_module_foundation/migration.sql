-- ==============================================================================
-- Migration: 20261011181500_cms_module_foundation
-- Description: Website Builder & Headless CMS (App 01) Namespaced Schema,
--              PostgreSQL Kernel Row-Level Security (RLS), Composite Multi-Tenant
--              Keys, and Performance Indexes (BRIN & Partial).
-- ==============================================================================

-- 1. Create Enums
CREATE TYPE "CmsSiteStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'MAINTENANCE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "CmsDomainStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'ERROR', 'DELETED');
CREATE TYPE "CmsPageStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED');
CREATE TYPE "CmsLocaleStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "CmsFormSubmissionStatus" AS ENUM ('NEW', 'PROCESSED', 'SPAM', 'ARCHIVED');
CREATE TYPE "CmsRedirectType" AS ENUM ('PERMANENT', 'TEMPORARY');

-- 2. Create Tables with Mandatory "cms_" Namespace

-- Table: cms_themes
CREATE TABLE "cms_themes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" VARCHAR(191) NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "tokens" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_themes_pkey" PRIMARY KEY ("id")
);

-- Table: cms_templates
CREATE TABLE "cms_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" VARCHAR(191) NOT NULL,
    "category" VARCHAR(64) NOT NULL,
    "previewImageUrl" TEXT,
    "blueprintJson" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_templates_pkey" PRIMARY KEY ("id")
);

-- Table: cms_section_templates
CREATE TABLE "cms_section_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" VARCHAR(191) NOT NULL,
    "category" VARCHAR(64) NOT NULL,
    "blockAst" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_section_templates_pkey" PRIMARY KEY ("id")
);

-- Table: cms_sites
CREATE TABLE "cms_sites" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "title" VARCHAR(191) NOT NULL,
    "slug" VARCHAR(191) NOT NULL,
    "status" "CmsSiteStatus" NOT NULL DEFAULT 'DRAFT',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    "primaryLocale" VARCHAR(10) NOT NULL DEFAULT 'en',
    "themeId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_sites_pkey" PRIMARY KEY ("id")
);

-- Table: cms_site_settings
CREATE TABLE "cms_site_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "faviconUrl" TEXT,
    "brandLogoUrl" TEXT,
    "brandName" VARCHAR(191),
    "headerAst" JSONB NOT NULL DEFAULT '{}',
    "footerAst" JSONB NOT NULL DEFAULT '{}',
    "customCss" TEXT,
    "customHeadCode" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_site_settings_pkey" PRIMARY KEY ("id")
);

-- Table: cms_domains
CREATE TABLE "cms_domains" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "hostname" VARCHAR(255) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isSubdomain" BOOLEAN NOT NULL DEFAULT false,
    "status" "CmsDomainStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verificationToken" VARCHAR(64) NOT NULL,
    "sslActive" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_domains_pkey" PRIMARY KEY ("id")
);

-- Table: cms_pages
CREATE TABLE "cms_pages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "parentId" TEXT,
    "title" VARCHAR(191) NOT NULL,
    "slug" VARCHAR(191) NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "status" "CmsPageStatus" NOT NULL DEFAULT 'DRAFT',
    "isHomePage" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_pages_pkey" PRIMARY KEY ("id")
);

-- Table: cms_page_contents
CREATE TABLE "cms_page_contents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "draftAst" JSONB NOT NULL DEFAULT '{}',
    "publishedAst" JSONB,
    "publishedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_page_contents_pkey" PRIMARY KEY ("id")
);

-- Table: cms_page_versions
CREATE TABLE "cms_page_versions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "astSnapshot" JSONB NOT NULL,
    "label" VARCHAR(100),
    "createdByUserId" VARCHAR(191),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cms_page_versions_pkey" PRIMARY KEY ("id")
);

-- Table: cms_page_comments
CREATE TABLE "cms_page_comments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "parentId" TEXT,
    "blockId" VARCHAR(64),
    "coordX" DECIMAL(5,2),
    "coordY" DECIMAL(5,2),
    "commentText" TEXT NOT NULL,
    "authorUserId" VARCHAR(191) NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_page_comments_pkey" PRIMARY KEY ("id")
);

-- Table: cms_collections
CREATE TABLE "cms_collections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" VARCHAR(191) NOT NULL,
    "slug" VARCHAR(191) NOT NULL,
    "schemaJson" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_collections_pkey" PRIMARY KEY ("id")
);

-- Table: cms_collection_items
CREATE TABLE "cms_collection_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "slug" VARCHAR(191) NOT NULL,
    "dataJson" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_collection_items_pkey" PRIMARY KEY ("id")
);

-- Table: cms_site_seo_settings
CREATE TABLE "cms_site_seo_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "metaTitle" VARCHAR(191),
    "metaDescription" TEXT,
    "ogImageUrl" TEXT,
    "robotsTxt" TEXT,
    "enableLlmsTxt" BOOLEAN NOT NULL DEFAULT true,
    "customStructuredData" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_site_seo_settings_pkey" PRIMARY KEY ("id")
);

-- Table: cms_site_locales
CREATE TABLE "cms_site_locales" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "displayName" VARCHAR(64) NOT NULL,
    "status" "CmsLocaleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_site_locales_pkey" PRIMARY KEY ("id")
);

-- Table: cms_page_translations
CREATE TABLE "cms_page_translations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "title" VARCHAR(191) NOT NULL,
    "translatedAst" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_page_translations_pkey" PRIMARY KEY ("id")
);

-- Table: cms_url_redirects
CREATE TABLE "cms_url_redirects" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "sourcePath" VARCHAR(255) NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "type" "CmsRedirectType" NOT NULL DEFAULT 'PERMANENT',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_url_redirects_pkey" PRIMARY KEY ("id")
);

-- Table: cms_form_submissions
CREATE TABLE "cms_form_submissions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "blockId" VARCHAR(64) NOT NULL,
    "idempotencyKey" VARCHAR(64) NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "status" "CmsFormSubmissionStatus" NOT NULL DEFAULT 'NEW',
    "submitterEmailHash" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cms_form_submissions_pkey" PRIMARY KEY ("id")
);

-- Table: cms_site_analytics_daily
CREATE TABLE "cms_site_analytics_daily" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalVisits" INTEGER NOT NULL DEFAULT 0,
    "uniqueVisitors" INTEGER NOT NULL DEFAULT 0,
    "bounceRate" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "topPaths" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_site_analytics_daily_pkey" PRIMARY KEY ("id")
);

-- Table: cms_plugin_installations
CREATE TABLE "cms_plugin_installations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "pluginId" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "encryptedConfig" TEXT NOT NULL,
    "iv" VARCHAR(32) NOT NULL,
    "tag" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_plugin_installations_pkey" PRIMARY KEY ("id")
);

-- Table: cms_navigation_menus
CREATE TABLE "cms_navigation_menus" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" VARCHAR(191) NOT NULL,
    "handle" VARCHAR(64) NOT NULL,
    "itemsAst" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_navigation_menus_pkey" PRIMARY KEY ("id")
);

-- Table: cms_audit_trails
CREATE TABLE "cms_audit_trails" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "entityType" VARCHAR(64) NOT NULL,
    "entityId" VARCHAR(64) NOT NULL,
    "actorUserId" VARCHAR(191) NOT NULL,
    "changesJson" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cms_audit_trails_pkey" PRIMARY KEY ("id")
);

-- 3. Unique Constraints
CREATE UNIQUE INDEX "cms_themes_code_key" ON "cms_themes"("code");
CREATE UNIQUE INDEX "cms_sites_organizationId_slug_key" ON "cms_sites"("organizationId", "slug");
CREATE UNIQUE INDEX "cms_sites_id_organizationId_key" ON "cms_sites"("id", "organizationId");
CREATE UNIQUE INDEX "cms_site_settings_siteId_key" ON "cms_site_settings"("siteId");
CREATE UNIQUE INDEX "cms_site_settings_siteId_organizationId_key" ON "cms_site_settings"("siteId", "organizationId");
CREATE UNIQUE INDEX "cms_domains_hostname_key" ON "cms_domains"("hostname");
CREATE UNIQUE INDEX "cms_pages_siteId_slug_key" ON "cms_pages"("siteId", "slug");
CREATE UNIQUE INDEX "cms_pages_id_organizationId_key" ON "cms_pages"("id", "organizationId");
CREATE UNIQUE INDEX "cms_page_contents_pageId_key" ON "cms_page_contents"("pageId");
CREATE UNIQUE INDEX "cms_page_contents_pageId_organizationId_key" ON "cms_page_contents"("pageId", "organizationId");
CREATE UNIQUE INDEX "cms_page_versions_pageId_versionNumber_key" ON "cms_page_versions"("pageId", "versionNumber");
CREATE UNIQUE INDEX "cms_collections_siteId_slug_key" ON "cms_collections"("siteId", "slug");
CREATE UNIQUE INDEX "cms_collections_id_organizationId_key" ON "cms_collections"("id", "organizationId");
CREATE UNIQUE INDEX "cms_collection_items_collectionId_slug_key" ON "cms_collection_items"("collectionId", "slug");
CREATE UNIQUE INDEX "cms_site_seo_settings_siteId_key" ON "cms_site_seo_settings"("siteId");
CREATE UNIQUE INDEX "cms_site_seo_settings_siteId_organizationId_key" ON "cms_site_seo_settings"("siteId", "organizationId");
CREATE UNIQUE INDEX "cms_site_locales_siteId_locale_key" ON "cms_site_locales"("siteId", "locale");
CREATE UNIQUE INDEX "cms_page_translations_pageId_locale_key" ON "cms_page_translations"("pageId", "locale");
CREATE UNIQUE INDEX "cms_url_redirects_siteId_sourcePath_key" ON "cms_url_redirects"("siteId", "sourcePath");
CREATE UNIQUE INDEX "cms_form_submissions_siteId_idempotencyKey_key" ON "cms_form_submissions"("siteId", "idempotencyKey");
CREATE UNIQUE INDEX "cms_site_analytics_daily_siteId_date_key" ON "cms_site_analytics_daily"("siteId", "date");
CREATE UNIQUE INDEX "cms_plugin_installations_siteId_pluginId_key" ON "cms_plugin_installations"("siteId", "pluginId");
CREATE UNIQUE INDEX "cms_navigation_menus_siteId_handle_key" ON "cms_navigation_menus"("siteId", "handle");

-- 4. Standard and B-Tree Indexes
CREATE INDEX "cms_themes_organizationId_idx" ON "cms_themes"("organizationId");
CREATE INDEX "cms_templates_organizationId_category_idx" ON "cms_templates"("organizationId", "category");
CREATE INDEX "cms_section_templates_organizationId_category_idx" ON "cms_section_templates"("organizationId", "category");
CREATE INDEX "cms_sites_organizationId_status_idx" ON "cms_sites"("organizationId", "status");
CREATE INDEX "cms_sites_branchId_idx" ON "cms_sites"("branchId");
CREATE INDEX "cms_site_settings_organizationId_siteId_idx" ON "cms_site_settings"("organizationId", "siteId");
CREATE INDEX "cms_domains_organizationId_siteId_idx" ON "cms_domains"("organizationId", "siteId");
CREATE INDEX "cms_domains_hostname_status_idx" ON "cms_domains"("hostname", "status");
CREATE INDEX "cms_pages_organizationId_siteId_idx" ON "cms_pages"("organizationId", "siteId");
CREATE INDEX "cms_pages_siteId_status_idx" ON "cms_pages"("siteId", "status");
CREATE INDEX "cms_pages_parentId_idx" ON "cms_pages"("parentId");
CREATE INDEX "cms_page_contents_organizationId_pageId_idx" ON "cms_page_contents"("organizationId", "pageId");
CREATE INDEX "cms_page_versions_organizationId_pageId_idx" ON "cms_page_versions"("organizationId", "pageId");
CREATE INDEX "cms_page_comments_organizationId_pageId_idx" ON "cms_page_comments"("organizationId", "pageId");
CREATE INDEX "cms_page_comments_parentId_idx" ON "cms_page_comments"("parentId");
CREATE INDEX "cms_collections_organizationId_siteId_idx" ON "cms_collections"("organizationId", "siteId");
CREATE INDEX "cms_collection_items_organizationId_collectionId_idx" ON "cms_collection_items"("organizationId", "collectionId");
CREATE INDEX "cms_site_seo_settings_organizationId_siteId_idx" ON "cms_site_seo_settings"("organizationId", "siteId");
CREATE INDEX "cms_site_locales_organizationId_siteId_idx" ON "cms_site_locales"("organizationId", "siteId");
CREATE INDEX "cms_page_translations_organizationId_pageId_idx" ON "cms_page_translations"("organizationId", "pageId");
CREATE INDEX "cms_url_redirects_organizationId_siteId_idx" ON "cms_url_redirects"("organizationId", "siteId");
CREATE INDEX "cms_form_submissions_organizationId_siteId_status_idx" ON "cms_form_submissions"("organizationId", "siteId", "status");
CREATE INDEX "cms_form_submissions_submitterEmailHash_idx" ON "cms_form_submissions"("submitterEmailHash");
CREATE INDEX "cms_site_analytics_daily_organizationId_siteId_date_idx" ON "cms_site_analytics_daily"("organizationId", "siteId", "date");
CREATE INDEX "cms_plugin_installations_organizationId_siteId_idx" ON "cms_plugin_installations"("organizationId", "siteId");
CREATE INDEX "cms_navigation_menus_organizationId_siteId_idx" ON "cms_navigation_menus"("organizationId", "siteId");
CREATE INDEX "cms_audit_trails_organizationId_siteId_createdAt_idx" ON "cms_audit_trails"("organizationId", "siteId", "createdAt");

-- 5. Advanced PostgreSQL Specific Indexes
-- BRIN index on append-heavy high-throughput form submissions table
CREATE INDEX "cms_form_submissions_created_at_brin_idx" ON "cms_form_submissions" USING BRIN ("createdAt");

-- Anti-hijacking partial unique index on domains (ignores soft-deleted domains)
CREATE UNIQUE INDEX "cms_domains_active_hostname_partial_idx" ON "cms_domains"("hostname")
WHERE "status" IN ('PENDING_VERIFICATION', 'ACTIVE');

-- 6. Foreign Key Relationships with Composite Multi-Tenant Cascades
ALTER TABLE "cms_sites" ADD CONSTRAINT "cms_sites_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cms_sites" ADD CONSTRAINT "cms_sites_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cms_sites" ADD CONSTRAINT "cms_sites_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "cms_themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cms_site_settings" ADD CONSTRAINT "cms_site_settings_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "cms_sites"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cms_domains" ADD CONSTRAINT "cms_domains_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "cms_sites"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cms_pages" ADD CONSTRAINT "cms_pages_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "cms_sites"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cms_pages" ADD CONSTRAINT "cms_pages_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "cms_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cms_page_contents" ADD CONSTRAINT "cms_page_contents_pageId_organizationId_fkey" FOREIGN KEY ("pageId", "organizationId") REFERENCES "cms_pages"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cms_page_versions" ADD CONSTRAINT "cms_page_versions_pageId_organizationId_fkey" FOREIGN KEY ("pageId", "organizationId") REFERENCES "cms_pages"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cms_page_comments" ADD CONSTRAINT "cms_page_comments_pageId_organizationId_fkey" FOREIGN KEY ("pageId", "organizationId") REFERENCES "cms_pages"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cms_page_comments" ADD CONSTRAINT "cms_page_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "cms_page_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cms_collections" ADD CONSTRAINT "cms_collections_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "cms_sites"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cms_collection_items" ADD CONSTRAINT "cms_collection_items_collectionId_organizationId_fkey" FOREIGN KEY ("collectionId", "organizationId") REFERENCES "cms_collections"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cms_site_seo_settings" ADD CONSTRAINT "cms_site_seo_settings_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "cms_sites"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cms_site_locales" ADD CONSTRAINT "cms_site_locales_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "cms_sites"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cms_page_translations" ADD CONSTRAINT "cms_page_translations_pageId_organizationId_fkey" FOREIGN KEY ("pageId", "organizationId") REFERENCES "cms_pages"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cms_url_redirects" ADD CONSTRAINT "cms_url_redirects_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "cms_sites"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cms_form_submissions" ADD CONSTRAINT "cms_form_submissions_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "cms_sites"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cms_site_analytics_daily" ADD CONSTRAINT "cms_site_analytics_daily_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "cms_sites"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cms_plugin_installations" ADD CONSTRAINT "cms_plugin_installations_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "cms_sites"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cms_navigation_menus" ADD CONSTRAINT "cms_navigation_menus_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "cms_sites"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cms_audit_trails" ADD CONSTRAINT "cms_audit_trails_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "cms_sites"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. PostgreSQL Kernel Row-Level Security (RLS) & Multi-Tenant Shield

-- Helper macro for applying tenant isolation policy
-- Tenant-owned tables (Must match app.current_organization_id)
DO $$
DECLARE
    tbl text;
    tenant_tables text[] := ARRAY[
        'cms_sites',
        'cms_site_settings',
        'cms_domains',
        'cms_pages',
        'cms_page_contents',
        'cms_page_versions',
        'cms_page_comments',
        'cms_collections',
        'cms_collection_items',
        'cms_site_seo_settings',
        'cms_site_locales',
        'cms_page_translations',
        'cms_url_redirects',
        'cms_form_submissions',
        'cms_site_analytics_daily',
        'cms_plugin_installations',
        'cms_navigation_menus',
        'cms_audit_trails'
    ];
BEGIN
    FOREACH tbl IN ARRAY tenant_tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('
            CREATE POLICY %I_tenant_isolation ON %I
            FOR ALL
            USING ("organizationId" = CURRENT_SETTING(''app.current_organization_id'', true))
            WITH CHECK ("organizationId" = CURRENT_SETTING(''app.current_organization_id'', true));
        ', tbl, tbl);
    END LOOP;
END $$;

-- Hybrid Tables (Global presets when organizationId IS NULL, or tenant-owned)
DO $$
DECLARE
    tbl text;
    hybrid_tables text[] := ARRAY[
        'cms_themes',
        'cms_templates',
        'cms_section_templates'
    ];
BEGIN
    FOREACH tbl IN ARRAY hybrid_tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('
            CREATE POLICY %I_tenant_and_global ON %I
            FOR SELECT
            USING ("organizationId" IS NULL OR "organizationId" = CURRENT_SETTING(''app.current_organization_id'', true));
        ', tbl, tbl);
        EXECUTE format('
            CREATE POLICY %I_tenant_mutation ON %I
            FOR INSERT
            WITH CHECK ("organizationId" = CURRENT_SETTING(''app.current_organization_id'', true));
        ', tbl, tbl);
    END LOOP;
END $$;
