-- ==============================================================================
-- App installation counts for the catalog (T095, FR-083)
--
-- app_platform deliberately has no grant on public.installed_apps (DB-2). The
-- catalog only needs an aggregate, so it reads one curated view instead of the
-- tenant-owned table. No organization id is exposed.
-- ==============================================================================

SET lock_timeout = '5s';

CREATE OR REPLACE VIEW platform."v_app_installation_counts" AS
SELECT
  "appId",
  count(*)::bigint AS "installedCount"
FROM public."installed_apps"
GROUP BY "appId";

COMMENT ON VIEW platform."v_app_installation_counts"
  IS 'Per application identifier: number of tenant installations. Aggregate only; no tenant identifier is exposed.';

REVOKE ALL ON platform."v_app_installation_counts" FROM PUBLIC;
REVOKE ALL ON platform."v_app_installation_counts" FROM app_tenant;
GRANT SELECT ON platform."v_app_installation_counts" TO app_platform;
