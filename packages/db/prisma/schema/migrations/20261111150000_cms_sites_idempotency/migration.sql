-- ==============================================================================
-- T-04 (#349): idempotent create-from-template
--
-- The client sends one request id for a site creation; the unique
-- (organizationId, idempotencyKey) pair makes a replay resolve to the already
-- provisioned site instead of creating a second one (CT-4, contract cms-admin).
-- A nullable column keeps legacy rows untouched: PostgreSQL treats NULLs as
-- distinct in a unique index, so every pre-existing site remains valid.
--
-- Forward-only and additive: no backfill, no row rewrite (DB-5). Table-level
-- grants and the existing tenant RLS policy already cover the new column.
-- ==============================================================================

SET lock_timeout = '5s';

ALTER TABLE "cms"."cms_sites"
    ADD COLUMN IF NOT EXISTS "idempotencyKey" VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS "cms_sites_organizationId_idempotencyKey_key"
    ON "cms"."cms_sites" ("organizationId", "idempotencyKey");
