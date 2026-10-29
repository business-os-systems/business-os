#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required (owner/migration identity)}"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql 15 or newer is required" >&2
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(expected.name, ', ') INTO missing
  FROM (VALUES
    ('20261025161000_platform_foundation'),
    ('20261025172000_platform_views')
  ) AS expected(name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM _prisma_migrations applied
    WHERE applied.migration_name = expected.name
      AND applied.finished_at IS NOT NULL
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Platform migrations are not applied: %', missing;
  END IF;

  IF NOT has_schema_privilege('app_platform', 'platform', 'USAGE') THEN
    RAISE EXCEPTION 'Platform grant missing: app_platform cannot use the platform schema';
  END IF;
  IF NOT has_table_privilege('app_platform', 'platform.operators', 'SELECT') THEN
    RAISE EXCEPTION 'Platform grant missing: app_platform cannot read platform.operators';
  END IF;
END
$$;

SELECT migration_name, finished_at
FROM _prisma_migrations
WHERE migration_name IN (
  '20261025161000_platform_foundation',
  '20261025172000_platform_views'
)
ORDER BY started_at;
SQL

echo "Platform migrations and app_platform grants are verified."
