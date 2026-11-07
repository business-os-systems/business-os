-- ==============================================================================
-- Quota writes with optimistic concurrency (#230, T092/T093, FR-114)
--
-- fn_set_quota predates the versioned write contract. This function keeps the
-- same validation, audit and FR-091 storage refusal, and adds the version token
-- so a stale platform edit is a 409 instead of an overwrite.
-- ==============================================================================

SET lock_timeout = '5s';

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

  -- FR-091: storage is not metered, so it may be recorded but never enforced.
  IF v_key = 'media.storage' AND coalesce(p_is_enforced, true) THEN
    RAISE EXCEPTION 'VALIDATION_FAILED' USING ERRCODE = 'PT422';
  END IF;

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

  -- D-022: a version token must never repeat or move backwards.
  IF v_before_version IS NOT NULL AND v_version <= v_before_version THEN
    v_updated_at := v_before_updated_at + interval '1 microsecond';
    v_version := to_char(
      v_updated_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    );
  END IF;

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
  ON CONFLICT ("organizationId", "resourceKey") DO UPDATE
  SET "limitValue" = EXCLUDED."limitValue",
      "isEnforced" = EXCLUDED."isEnforced",
      "updatedBy" = EXCLUDED."updatedBy",
      "updatedAt" = EXCLUDED."updatedAt";

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
  IS 'Upserts one quota with an optimistic-concurrency token, audits before/after and refuses to enforce unmeasurable storage (FR-091, FR-114).';

REVOKE ALL ON FUNCTION platform.fn_set_quota_versioned(text, text, bigint, boolean, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_set_quota_versioned(text, text, bigint, boolean, text, text, text) FROM app_tenant;
GRANT EXECUTE ON FUNCTION platform.fn_set_quota_versioned(text, text, bigint, boolean, text, text, text) TO app_platform;
