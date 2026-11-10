-- ==============================================================================
-- Tenant local time (FR-055)
--
-- The tenant time zone is the zone declared by its root (headquarters) branch.
-- The fleet and record views run with the owner's privileges, so app_platform
-- reads the zone through this curated surface and never from the tenant
-- business tables (FR-061, CT-8). A tenant with no branch yet falls back to
-- the platform's declared reference zone, UTC.
-- ==============================================================================

CREATE OR REPLACE VIEW "platform"."v_tenant_overview" AS
SELECT
  o."id",
  o."name",
  o."slug",
  o."status",
  o."createdAt",
  (
    SELECT count(*)::integer
    FROM "public"."branches" b
    WHERE b."organizationId" = o."id"
  ) AS "branchCount",
  (
    SELECT count(*)::integer
    FROM "public"."user_organizations" uo
    WHERE uo."organizationId" = o."id"
      AND uo."status" = 'ACTIVE'
  ) AS "memberCount",
  (
    SELECT COALESCE(array_agg(ia."appId" ORDER BY ia."appId"), ARRAY[]::text[])
    FROM "public"."installed_apps" ia
    WHERE ia."organizationId" = o."id"
  ) AS "installedAppIds",
  COALESCE(
    (
      SELECT b."timezone"
      FROM "public"."branches" b
      WHERE b."organizationId" = o."id"
      ORDER BY (b."parentBranchId" IS NULL) DESC, b."createdAt" ASC, b."id" ASC
      LIMIT 1
    ),
    'UTC'
  ) AS "timezone"
FROM "public"."organizations" o;

COMMENT ON VIEW "platform"."v_tenant_overview"
  IS 'Tenant metadata for the operator fleet: org identity, status, counts, installed apps and the tenant local time zone. No personal data.';

REVOKE ALL ON "platform"."v_tenant_overview" FROM PUBLIC;
GRANT SELECT ON "platform"."v_tenant_overview" TO app_platform;
REVOKE ALL ON "platform"."v_tenant_overview" FROM app_tenant;
