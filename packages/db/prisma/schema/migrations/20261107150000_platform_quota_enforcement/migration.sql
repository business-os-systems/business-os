-- ==============================================================================
-- Quota usage view (T094, FR-026, FR-028, FR-081, FR-091)
--
-- The tenant write paths cannot read platform.quotas. This migration owns the
-- granted usage projection; the tenant-callable SECURITY DEFINER gate is
-- defined once in 20261107152000_platform_quota_gate_types so the function is
-- not created twice (XV.6).
-- ==============================================================================

SET lock_timeout = '5s';

-- ==============================================================================
-- Usage view: over-limit marker and member-seat definition
--
-- Member seats are invitations and active/suspended memberships; a revoked
-- membership frees its seat. media.storage stays unmeasured (FR-091).
-- ==============================================================================

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
        FROM public."cms_pages" p
        WHERE p."organizationId" = q."organizationId"
          AND p."status" <> 'ARCHIVED'
      )
      WHEN 'cms.custom_domains' THEN (
        SELECT count(*)::bigint
        FROM public."cms_domains" d
        WHERE d."organizationId" = q."organizationId"
          AND d."status" <> 'DELETED'
          AND d."isSubdomain" = false
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
  IS 'Per tenant and quota resource: configured limit plus consumption where a source exists; NULL consumption means not measurable (FR-091). Custom domains exclude the auto-provisioned *.business-os.site subdomain. isOverLimit marks a lowered limit without touching content (FR-081).';
