-- ==============================================================================
-- Quota usage projection: correction for databases that applied the first
-- 20261111180000 revision (media.storage was present only in the unit CASE,
-- so currentValue stayed NULL). This re-issuing is idempotent.
-- ==============================================================================


SET lock_timeout = '5s';

CREATE OR REPLACE VIEW platform."v_tenant_usage" AS
WITH measured AS (
  SELECT
    q."organizationId",
    q."resourceKey",
    q."limitValue",
    q."isEnforced",
    q."updatedAt" AS "limitUpdatedAt",
    CASE q."resourceKey"
      WHEN 'core.branches' THEN (
        SELECT count(*)::bigint
        FROM public."branches" b
        WHERE b."organizationId" = q."organizationId"
          AND b."status" <> 'ARCHIVED'
      )
      WHEN 'core.members' THEN (
        SELECT count(*)::bigint
        FROM public."user_organizations" uo
        WHERE uo."organizationId" = q."organizationId"
          AND uo."status" <> 'REVOKED'
      )
      WHEN 'cms.pages' THEN (
        SELECT count(*)::bigint
        FROM cms."cms_pages" p
        WHERE p."organizationId" = q."organizationId"
          AND p."status" <> 'ARCHIVED'
      )
      WHEN 'cms.custom_domains' THEN (
        SELECT count(*)::bigint
        FROM cms."cms_domains" d
        WHERE d."organizationId" = q."organizationId"
          AND d."status" <> 'DELETED'
          AND d."isSubdomain" = false
      )
      WHEN 'media.storage' THEN (
        SELECT coalesce(sum(a."sizeBytes"), 0)::bigint
        FROM public."media_assets" a
        WHERE a."organizationId" = q."organizationId"
          AND a."status" = 'ACTIVE'
      )
      ELSE NULL
    END AS "currentValue",
    CASE q."resourceKey"
      WHEN 'media.storage' THEN 'bytes'
      WHEN 'core.branches' THEN 'count'
      WHEN 'core.members' THEN 'count'
      WHEN 'cms.pages' THEN 'count'
      WHEN 'cms.custom_domains' THEN 'count'
      ELSE NULL
    END AS "unit"
  FROM platform."quotas" q
)
SELECT
  m."organizationId",
  m."resourceKey",
  m."limitValue",
  m."unit",
  m."isEnforced",
  m."currentValue",
  (m."currentValue" IS NOT NULL) AS "isMeasurable",
  now() AS "asOf",
  m."limitUpdatedAt",
  (
    m."currentValue" IS NOT NULL
    AND m."currentValue" > m."limitValue"
  ) AS "isOverLimit"
FROM measured m;

COMMENT ON VIEW platform."v_tenant_usage"
  IS 'Per tenant and quota resource: configured limit plus consumption where a source exists; NULL consumption means not measurable. Storage sums ACTIVE media_assets rows once per checksum, cms counters read the cms schema (FR-052, FR-091, FR-122).';

REVOKE ALL ON TABLE platform."v_tenant_usage" FROM PUBLIC;
GRANT SELECT ON TABLE platform."v_tenant_usage" TO app_tenant;
GRANT SELECT ON TABLE platform."v_tenant_usage" TO app_platform;
