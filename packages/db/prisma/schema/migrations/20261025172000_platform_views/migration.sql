-- ==============================================================================
-- Platform views (T015, partial)
-- A new migration because the foundation migration is already applied.
-- The usage view is deferred to #248 until quota keys are defined.
-- ==============================================================================

-- Organization metadata only; no personal data.
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
  ) AS "installedAppIds"
FROM "public"."organizations" o;

COMMENT ON VIEW "platform"."v_tenant_overview"
  IS 'Tenant metadata for the operator fleet: org identity, status, counts and installed apps. No personal data.';

-- Shared read contract for every application role.
CREATE OR REPLACE VIEW "reference"."v_active_catalog_values" AS
SELECT
  cv."id",
  cv."catalogKey",
  c."label" AS "catalogLabel",
  cv."code",
  cv."label",
  cv."sortOrder",
  cv."metadata",
  cv."version",
  cv."updatedAt"
FROM "reference"."catalog_values" cv
JOIN "reference"."catalogs" c ON c."key" = cv."catalogKey"
WHERE cv."isActive" = true
ORDER BY cv."catalogKey", cv."sortOrder", cv."label";

COMMENT ON VIEW "reference"."v_active_catalog_values"
  IS 'Active reference values with catalog labels. Read-only contract for every application role.';

-- ==============================================================================
-- Grants
-- Views run with the owner's privileges, so callers need no base-table grants.
-- ==============================================================================
REVOKE ALL ON "platform"."v_tenant_overview" FROM PUBLIC;
REVOKE ALL ON "reference"."v_active_catalog_values" FROM PUBLIC;

GRANT SELECT ON "platform"."v_tenant_overview" TO app_platform;
REVOKE ALL ON "platform"."v_tenant_overview" FROM app_tenant;

GRANT SELECT ON "reference"."v_active_catalog_values" TO app_platform, app_tenant;
