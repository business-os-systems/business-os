-- ==============================================================================
-- Media storage metering (#344, FR-052, FR-122)
--
-- Storage becomes a measurable, enforceable tenant quota now that every
-- uploaded byte has exactly one media_assets row per tenant (checksum dedupe).
-- The usage view sums ACTIVE rows, so a duplicate upload counts once.
--
-- Forward-only. The versioned quota gate keeps its optimistic-concurrency and
-- audit behaviour; only the "storage is never measurable" refusal is removed,
-- because the source it required now exists.
-- ==============================================================================

SET lock_timeout = '5s';

-- ==============================================================================
-- 1. Usage view with media.storage measured
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
  IS 'Per tenant and quota resource: configured limit plus consumption where a source exists; NULL consumption means not measurable (FR-091). Storage sums ACTIVE media_assets rows, one per checksum per tenant, so duplicate uploads count once. isOverLimit marks a lowered limit without touching content (FR-081).';

-- ==============================================================================
-- 2. Versioned quota gate without the storage refusal
-- ==============================================================================
CREATE OR REPLACE FUNCTION platform.fn_set_quota_versioned(
  p_org_id text,
  p_resource_key text,
  p_limit_value bigint,
  p_is_enforced boolean,
  p_expected_version text,
  p_actor_id text,
  p_request_id text
) RETURNS TABLE (
  "resourceKey" text,
  "limitValue" bigint,
  "isEnforced" boolean,
  "version" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
#variable_conflict use_column
DECLARE
  v_key text := btrim(coalesce(p_resource_key, ''));
  v_before_limit bigint;
  v_before_enforced boolean;
  v_before_updated_at timestamptz;
  v_before_version text;
  v_before jsonb;
  v_updated_at timestamptz;
  v_version text;
BEGIN
  PERFORM platform.fn_require_capability(p_actor_id, 'platform:quotas:manage');
  PERFORM platform.fn_assert_request_id(p_request_id);

  IF v_key = '' THEN
    RAISE EXCEPTION 'UNKNOWN_RESOURCE_KEY' USING ERRCODE = 'PT422';
  END IF;

  IF p_limit_value IS NULL OR p_limit_value < 0 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED' USING ERRCODE = 'PT422';
  END IF;

  PERFORM platform.fn_require_tenant(p_org_id);

  SELECT q."limitValue", q."isEnforced", q."updatedAt"
    INTO v_before_limit, v_before_enforced, v_before_updated_at
  FROM platform.quotas q
  WHERE q."organizationId" = p_org_id
    AND q."resourceKey" = v_key
  FOR UPDATE;

  IF FOUND THEN
    v_before_version := to_char(
      v_before_updated_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    );
    v_before := jsonb_build_object(
      'limitValue', v_before_limit::text,
      'isEnforced', v_before_enforced
    );

    IF btrim(coalesce(p_expected_version, '')) = ''
      OR v_before_version IS DISTINCT FROM btrim(p_expected_version)
    THEN
      RAISE EXCEPTION 'QUOTA_CONFLICT' USING ERRCODE = 'PT409';
    END IF;
  ELSE
    v_before := NULL;

    IF btrim(coalesce(p_expected_version, '')) <> '' THEN
      RAISE EXCEPTION 'QUOTA_CONFLICT' USING ERRCODE = 'PT409';
    END IF;
  END IF;

  v_updated_at := clock_timestamp();
  v_version := to_char(
    v_updated_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  );

  IF v_before_version IS NOT NULL AND v_version <= v_before_version THEN
    v_updated_at := v_before_updated_at + interval '1 microsecond';
    v_version := to_char(
      v_updated_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    );
  END IF;

  IF v_before IS NOT NULL THEN
    UPDATE platform.quotas AS q
    SET "limitValue" = p_limit_value,
        "isEnforced" = coalesce(p_is_enforced, true),
        "updatedBy" = p_actor_id,
        "updatedAt" = v_updated_at
    WHERE q."organizationId" = p_org_id
      AND q."resourceKey" = v_key;
  ELSE
    INSERT INTO platform.quotas (
      "id",
      "organizationId",
      "resourceKey",
      "limitValue",
      "isEnforced",
      "updatedBy",
      "createdAt",
      "updatedAt"
    ) VALUES (
      gen_random_uuid()::text,
      p_org_id,
      v_key,
      p_limit_value,
      coalesce(p_is_enforced, true),
      p_actor_id,
      v_updated_at,
      v_updated_at
    )
    ON CONFLICT ("organizationId", "resourceKey") DO NOTHING;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'QUOTA_CONFLICT' USING ERRCODE = 'PT409';
    END IF;
  END IF;

  PERFORM platform.fn_append_audit(
    p_actor_id,
    'TENANT_QUOTA_SET',
    'quota',
    v_key,
    p_org_id,
    v_before,
    jsonb_build_object(
      'limitValue', p_limit_value::text,
      'isEnforced', coalesce(p_is_enforced, true)
    ),
    NULL,
    p_request_id
  );

  RETURN QUERY SELECT v_key, p_limit_value, coalesce(p_is_enforced, true), v_version;
END;
$$;

COMMENT ON FUNCTION platform.fn_set_quota_versioned(text, text, bigint, boolean, text, text, text)
  IS 'Versioned quota upsert with an audit row in the same transaction. Storage is enforceable because media_storage is measured from media_assets (FR-122).';

REVOKE ALL ON FUNCTION platform.fn_set_quota_versioned(text, text, bigint, boolean, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_set_quota_versioned(text, text, bigint, boolean, text, text, text) FROM app_tenant;
GRANT EXECUTE ON FUNCTION platform.fn_set_quota_versioned(text, text, bigint, boolean, text, text, text) TO app_platform;
