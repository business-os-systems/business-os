-- ==============================================================================
-- T-08 (#353): inquiries replace the form-submission prototype
--
-- One forward-only unit (DB-4): enum/table rename, new columns, the append-only
-- inquiry event, grants, forced RLS and the public site-context helper.
-- Renaming (rather than dropping) keeps any pre-release row and its history.
-- No row is rewritten; new NOT NULL columns carry defaults, so the DDL stays
-- separate from data movement (DB-5). The old cms_ingest_form_submission
-- SECURITY DEFINER helper is retired: ingestion now runs in the service under
-- the tenant RLS context and the only public database helper resolves a
-- published site to its organization id.
-- ==============================================================================

SET lock_timeout = '5s';

-- 1. Status vocabulary: NEW -> READ -> ARCHIVED | SPAM. The prototype's
--    PROCESSED value becomes READ; every other value keeps its meaning.
DO $$
BEGIN
    IF to_regtype('cms."CmsFormSubmissionStatus"') IS NOT NULL
       AND to_regtype('cms."CmsInquiryStatus"') IS NULL THEN
        ALTER TYPE cms."CmsFormSubmissionStatus" RENAME TO "CmsInquiryStatus";
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'cms'
          AND t.typname = 'CmsInquiryStatus'
          AND e.enumlabel = 'PROCESSED'
    ) THEN
        ALTER TYPE cms."CmsInquiryStatus" RENAME VALUE 'PROCESSED' TO 'READ';
    END IF;
END $$;

-- 2. The table keeps its rows and constraints; only its name changes.
DO $$
BEGIN
    IF to_regclass('cms.cms_form_submissions') IS NOT NULL
       AND to_regclass('cms.cms_inquiries') IS NULL THEN
        ALTER TABLE cms."cms_form_submissions" RENAME TO "cms_inquiries";
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'cms' AND table_name = 'cms_inquiries'
          AND column_name = 'submitterEmailHash'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'cms' AND table_name = 'cms_inquiries'
          AND column_name = 'emailHash'
    ) THEN
        ALTER TABLE cms."cms_inquiries" RENAME COLUMN "submitterEmailHash" TO "emailHash";
    END IF;
END $$;

-- 3. New columns. Defaults backfill existing pre-release rows without a second
--    pass; the service always writes an explicit retention deadline.
ALTER TABLE cms."cms_inquiries"
    ADD COLUMN IF NOT EXISTS "pageId" VARCHAR(64),
    ADD COLUMN IF NOT EXISTS "spamVerdict" VARCHAR(32),
    ADD COLUMN IF NOT EXISTS "submitterHash" VARCHAR(64),
    ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMPTZ(6),
    ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ(6),
    ADD COLUMN IF NOT EXISTS "retentionExpiresAt" TIMESTAMPTZ(6)
        NOT NULL DEFAULT (now() + interval '365 days'),
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ(6)
        NOT NULL DEFAULT now();

-- Widen the keys the inquiry contract allows (Idempotency-Key is 8-128 chars,
-- a form block id up to 100).
ALTER TABLE cms."cms_inquiries" ALTER COLUMN "idempotencyKey" TYPE VARCHAR(128);
ALTER TABLE cms."cms_inquiries" ALTER COLUMN "blockId" TYPE VARCHAR(100);

-- 4. Canonical index names follow the renamed table. The prototype's
--    (organizationId, siteId, status) and email-hash indexes are replaced by
--    the list, unread and retention access paths.
DO $$
BEGIN
    IF to_regclass('cms.cms_form_submissions_pkey') IS NOT NULL THEN
        ALTER INDEX cms."cms_form_submissions_pkey" RENAME TO "cms_inquiries_pkey";
    END IF;
    IF to_regclass('cms.cms_form_submissions_siteId_idempotencyKey_key') IS NOT NULL THEN
        ALTER INDEX cms."cms_form_submissions_siteId_idempotencyKey_key"
            RENAME TO "cms_inquiries_siteId_idempotencyKey_key";
    END IF;
END $$;

DROP INDEX IF EXISTS cms."cms_form_submissions_organizationId_siteId_status_idx";
DROP INDEX IF EXISTS cms."cms_form_submissions_submitterEmailHash_idx";

CREATE INDEX IF NOT EXISTS "cms_inquiries_organizationId_siteId_status_createdAt_idx"
    ON cms."cms_inquiries" ("organizationId", "siteId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "cms_inquiries_organizationId_status_idx"
    ON cms."cms_inquiries" ("organizationId", "status");
CREATE INDEX IF NOT EXISTS "cms_inquiries_emailHash_idx"
    ON cms."cms_inquiries" ("emailHash");
CREATE INDEX IF NOT EXISTS "cms_inquiries_organizationId_retentionExpiresAt_idx"
    ON cms."cms_inquiries" ("organizationId", "retentionExpiresAt");

-- Defence in depth for the 64KB contract (FR-044). NOT VALID keeps the
-- migration forward-only over pre-release rows; every new insert is checked.
ALTER TABLE cms."cms_inquiries"
    DROP CONSTRAINT IF EXISTS "cms_inquiries_payload_size_check";
ALTER TABLE cms."cms_inquiries"
    ADD CONSTRAINT "cms_inquiries_payload_size_check"
    CHECK (pg_column_size("payloadJson") <= 65536) NOT VALID;

-- Composite target for the inquiry-event foreign key.
CREATE UNIQUE INDEX IF NOT EXISTS "cms_inquiries_id_organizationId_key"
    ON cms."cms_inquiries" ("id", "organizationId");

-- 5. Append-only inquiry event for the later shared notification capability
--    (FR-140). Nothing dispatches it in release one (FR-138).
CREATE TABLE IF NOT EXISTS cms."cms_inquiry_events" (
    "id" VARCHAR(30) NOT NULL,
    "organizationId" VARCHAR(191) NOT NULL,
    "siteId" VARCHAR(191) NOT NULL,
    "inquiryId" VARCHAR(191) NOT NULL,
    "eventType" VARCHAR(64) NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "cms_inquiry_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cms_inquiry_events_inquiryId_organizationId_fkey"
        FOREIGN KEY ("inquiryId", "organizationId")
        REFERENCES cms."cms_inquiries"("id", "organizationId")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "cms_inquiry_events_inquiryId_eventType_key"
    ON cms."cms_inquiry_events" ("inquiryId", "eventType");
CREATE INDEX IF NOT EXISTS "cms_inquiry_events_organizationId_eventType_createdAt_idx"
    ON cms."cms_inquiry_events" ("organizationId", "eventType", "createdAt");

-- 6. Grants. The runtime tenant identity owns the full inquiry row lifecycle so
--    retention and erasure can delete; the event log is append-only to it.
REVOKE ALL ON TABLE cms."cms_inquiries" FROM PUBLIC;
REVOKE ALL ON TABLE cms."cms_inquiries" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE cms."cms_inquiries" TO app_tenant;

REVOKE ALL ON TABLE cms."cms_inquiry_events" FROM PUBLIC;
REVOKE ALL ON TABLE cms."cms_inquiry_events" FROM app_tenant;
GRANT SELECT, INSERT ON TABLE cms."cms_inquiry_events" TO app_tenant;

REVOKE ALL ON TYPE cms."CmsInquiryStatus" FROM PUBLIC;
GRANT USAGE ON TYPE cms."CmsInquiryStatus" TO app_tenant, app_platform;

-- 7. Forced row-level security, keyed on the transaction-local tenant context.
ALTER TABLE cms."cms_inquiries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms."cms_inquiries" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'cms' AND tablename = 'cms_inquiries'
          AND policyname = 'cms_inquiries_tenant_isolation'
    ) THEN
        CREATE POLICY "cms_inquiries_tenant_isolation"
            ON cms."cms_inquiries"
            FOR ALL
            USING ("organizationId" = CURRENT_SETTING('app.current_organization_id', true))
            WITH CHECK ("organizationId" = CURRENT_SETTING('app.current_organization_id', true));
    END IF;
END $$;

ALTER TABLE cms."cms_inquiry_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms."cms_inquiry_events" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'cms' AND tablename = 'cms_inquiry_events'
          AND policyname = 'cms_inquiry_events_tenant_isolation'
    ) THEN
        CREATE POLICY "cms_inquiry_events_tenant_isolation"
            ON cms."cms_inquiry_events"
            FOR ALL
            USING ("organizationId" = CURRENT_SETTING('app.current_organization_id', true))
            WITH CHECK ("organizationId" = CURRENT_SETTING('app.current_organization_id', true));
    END IF;
END $$;

-- 8. Public helper: resolves only a PUBLISHED site to its organization, so the
--    intake path can enter the tenant RLS context without trusting the caller.
CREATE OR REPLACE FUNCTION public.cms_public_site_organization(p_site_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, cms
AS $$
    SELECT s."organizationId"
    FROM cms."cms_sites" s
    WHERE s."id" = p_site_id
      AND s."status" = 'PUBLISHED'
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.cms_public_site_organization(text) FROM PUBLIC;
DO $$
BEGIN
    EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.cms_public_site_organization(text) TO %I',
        current_user
    );
END $$;

-- 9. Retention purge: the only cross-tenant delete. It removes rows at or
--    past their declared deadline and returns a count, never a row (FR-049).
CREATE OR REPLACE FUNCTION public.cms_purge_expired_inquiries(p_batch_size integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, cms
AS $$
DECLARE
    v_count integer;
BEGIN
    WITH expired AS (
        SELECT i."id"
        FROM cms."cms_inquiries" i
        WHERE i."retentionExpiresAt" <= now()
        ORDER BY i."retentionExpiresAt"
        LIMIT GREATEST(p_batch_size, 1)
        FOR UPDATE SKIP LOCKED
    )
    DELETE FROM cms."cms_inquiries" i
    USING expired e
    WHERE i."id" = e."id";
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.cms_purge_expired_inquiries(integer) FROM PUBLIC;
DO $$
BEGIN
    EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.cms_purge_expired_inquiries(integer) TO %I',
        current_user
    );
END $$;

-- The prototype SECURITY DEFINER ingestion helper is superseded.
DROP FUNCTION IF EXISTS public.cms_ingest_form_submission(text, text, text, jsonb, jsonb, text);

COMMENT ON TABLE cms."cms_inquiries"
    IS 'A captured website enquiry. Tenant-owned; contact fields are gated by cms:leads:pii and every personal-data read is audited (FR-048). Rows are purged 365 days after capture unless erased earlier (FR-049).';
COMMENT ON COLUMN cms."cms_inquiries"."retentionExpiresAt"
    IS 'Declared retention deadline: capture time + 365 days. The retention job deletes rows at or past this instant.';
COMMENT ON TABLE cms."cms_inquiry_events"
    IS 'Append-only inquiry domain events staged for the later shared notification capability. Release one never dispatches them (FR-138, FR-140).';
