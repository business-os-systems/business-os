-- ==============================================================================
-- Website Builder site deletion lifecycle (issue #378, FR-097, FR-099)
--
-- An inactive site is flagged for deletion and stays intact until an authorised
-- operator explicitly confirms removal. The flag is stored on the cms-owned
-- site row; no timer can ever delete content (FR-097).
--
-- Forward-only migration; DDL only, no backfill. lock_timeout is set so the
-- ALTER cannot queue behind a long transaction (DB-5).
-- ==============================================================================

SET lock_timeout = '5s';

ALTER TABLE "cms"."cms_sites"
  ADD COLUMN IF NOT EXISTS "deletionFlaggedAt" timestamptz(6),
  ADD COLUMN IF NOT EXISTS "deletionConfirmedAt" timestamptz(6),
  ADD COLUMN IF NOT EXISTS "deletionConfirmedBy" varchar(191);

CREATE INDEX IF NOT EXISTS "cms_sites_deletionFlaggedAt_idx"
  ON "cms"."cms_sites" ("deletionFlaggedAt");
