-- ==============================================================================
-- Migration: 20261011182500_cms_security_definer_functions
-- Description: Pre-Tenant Storefront Security Definer Functions for Edge Gateway.
--              Implements public.cms_resolve_domain() and public.cms_ingest_form_submission()
--              with hardened search_path, explicit column projection, and least-privilege grants.
-- ==============================================================================

-- 1. Security Definer Domain Resolver Function
-- Resolves incoming edge request hostname to published site and active homepage
CREATE OR REPLACE FUNCTION public.cms_resolve_domain(p_hostname TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_norm_hostname TEXT;
    v_domain_record RECORD;
    v_site_record RECORD;
    v_settings_record RECORD;
    v_home_page_record RECORD;
    v_theme_tokens JSONB;
    v_result JSONB;
BEGIN
    -- Normalize hostname: lowercased, trimmed
    v_norm_hostname := LOWER(TRIM(p_hostname));

    IF v_norm_hostname IS NULL OR v_norm_hostname = '' THEN
        RETURN jsonb_build_object(
            'resolved', false,
            'reason', 'INVALID_HOSTNAME'
        );
    END IF;

    -- 1. Locate Domain (Active status only)
    SELECT d."id", d."organizationId", d."siteId", d."hostname", d."isPrimary", d."status"
    INTO v_domain_record
    FROM "cms_domains" d
    WHERE d."hostname" = v_norm_hostname
      AND d."status" = 'ACTIVE'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'resolved', false,
            'reason', 'DOMAIN_NOT_FOUND'
        );
    END IF;

    -- 2. Locate Published Site
    SELECT s."id", s."organizationId", s."branchId", s."title", s."slug", s."status",
           s."timezone", s."primaryLocale", s."themeId"
    INTO v_site_record
    FROM "cms_sites" s
    WHERE s."id" = v_domain_record."siteId"
      AND s."status" = 'PUBLISHED'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'resolved', false,
            'reason', 'SITE_NOT_PUBLISHED'
        );
    END IF;

    -- 3. Fetch Site Settings (Brand & Nav AST)
    SELECT ss."faviconUrl", ss."brandLogoUrl", ss."brandName",
           ss."headerAst", ss."footerAst", ss."customCss"
    INTO v_settings_record
    FROM "cms_site_settings" ss
    WHERE ss."siteId" = v_site_record."id"
    LIMIT 1;

    -- 4. Fetch Theme Tokens if linked
    IF v_site_record."themeId" IS NOT NULL THEN
        SELECT t."tokens"
        INTO v_theme_tokens
        FROM "cms_themes" t
        WHERE t."id" = v_site_record."themeId";
    END IF;

    -- 5. Fetch Active Published Homepage
    SELECT p."id", p."slug", p."title", pc."publishedAst"
    INTO v_home_page_record
    FROM "cms_pages" p
    INNER JOIN "cms_page_contents" pc ON pc."pageId" = p."id"
    WHERE p."siteId" = v_site_record."id"
      AND p."isHomePage" = true
      AND p."status" = 'PUBLISHED'
      AND pc."publishedAst" IS NOT NULL
    LIMIT 1;

    -- Construct minimized payload (Strictly zero internal organization credentials or drafts)
    v_result := jsonb_build_object(
        'resolved', true,
        'siteId', v_site_record."id",
        'title', v_site_record."title",
        'slug', v_site_record."slug",
        'primaryLocale', v_site_record."primaryLocale",
        'timezone', v_site_record."timezone",
        'brand', jsonb_build_object(
            'brandName', COALESCE(v_settings_record."brandName", v_site_record."title"),
            'brandLogoUrl', v_settings_record."brandLogoUrl",
            'faviconUrl', v_settings_record."faviconUrl"
        ),
        'themeTokens', COALESCE(v_theme_tokens, '{}'::jsonb),
        'headerAst', COALESCE(v_settings_record."headerAst", '{}'::jsonb),
        'footerAst', COALESCE(v_settings_record."footerAst", '{}'::jsonb),
        'customCss', v_settings_record."customCss",
        'homePage', CASE WHEN v_home_page_record."id" IS NOT NULL THEN
            jsonb_build_object(
                'pageId', v_home_page_record."id",
                'slug', v_home_page_record."slug",
                'title', v_home_page_record."title",
                'publishedAst', v_home_page_record."publishedAst"
            )
        ELSE NULL END
    );

    RETURN v_result;
END;
$$;


-- 2. Security Definer Form Ingestion Function
-- Validates published site, checks max payload constraint, and inserts atomic submission record
CREATE OR REPLACE FUNCTION public.cms_ingest_form_submission(
    p_site_id TEXT,
    p_block_id TEXT,
    p_idempotency_key TEXT,
    p_payload JSONB,
    p_attachments JSONB DEFAULT '[]'::jsonb,
    p_email_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_site_record RECORD;
    v_existing_submission RECORD;
    v_new_id TEXT;
    v_payload_bytes INT;
BEGIN
    -- 1. Validate payload size constraint (Max 64KB)
    v_payload_bytes := pg_column_size(p_payload);
    IF v_payload_bytes > 65536 THEN
        RETURN jsonb_build_object(
            'success', false,
            'errorCode', 'PAYLOAD_TOO_LARGE',
            'message', 'Form submission payload exceeds maximum 64KB limit'
        );
    END IF;

    -- 2. Verify site exists and is published
    SELECT s."id", s."organizationId", s."status"
    INTO v_site_record
    FROM "cms_sites" s
    WHERE s."id" = p_site_id
      AND s."status" = 'PUBLISHED'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'errorCode', 'SITE_NOT_AVAILABLE',
            'message', 'Target site is not published or active'
        );
    END IF;

    -- 3. Check Idempotency Key (Return cached response if duplicate)
    SELECT fs."id", fs."createdAt"
    INTO v_existing_submission
    FROM "cms_form_submissions" fs
    WHERE fs."siteId" = p_site_id
      AND fs."idempotencyKey" = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'submissionId', v_existing_submission."id",
            'isDuplicate', true,
            'createdAt', v_existing_submission."createdAt"
        );
    END IF;

    -- 4. Generate CUID-style canonical ID
    v_new_id := 'csub_' || md5(random()::text || clock_timestamp()::text);

    -- 5. Insert Record directly into cms_form_submissions
    INSERT INTO "cms_form_submissions" (
        "id",
        "organizationId",
        "siteId",
        "blockId",
        "idempotencyKey",
        "payloadJson",
        "attachments",
        "status",
        "submitterEmailHash",
        "createdAt"
    ) VALUES (
        v_new_id,
        v_site_record."organizationId",
        p_site_id,
        p_block_id,
        p_idempotency_key,
        p_payload,
        COALESCE(p_attachments, '[]'::jsonb),
        'NEW',
        p_email_hash,
        clock_timestamp()
    );

    RETURN jsonb_build_object(
        'success', true,
        'submissionId', v_new_id,
        'isDuplicate', false
    );
END;
$$;

-- 3. Least-Privilege Access Controls
-- Revoke execution from PUBLIC to prevent unauthorized search-path escalation
REVOKE ALL ON FUNCTION public.cms_resolve_domain(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cms_ingest_form_submission(TEXT, TEXT, TEXT, JSONB, JSONB, TEXT) FROM PUBLIC;

-- Grant execution to runtime application roles if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_edge') THEN
        GRANT EXECUTE ON FUNCTION public.cms_resolve_domain(TEXT) TO app_edge;
        GRANT EXECUTE ON FUNCTION public.cms_ingest_form_submission(TEXT, TEXT, TEXT, JSONB, JSONB, TEXT) TO app_edge;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
        GRANT EXECUTE ON FUNCTION public.cms_resolve_domain(TEXT) TO app_runtime;
        GRANT EXECUTE ON FUNCTION public.cms_ingest_form_submission(TEXT, TEXT, TEXT, JSONB, JSONB, TEXT) TO app_runtime;
    END IF;
END $$;
