-- ==============================================================================
-- App entitlements and validated settings (#229, T088-T091)
--
-- Forward-only. app_platform has no grant on the public schema, so the read
-- contract is a new view and writes stay inside SECURITY DEFINER functions.
-- The versioned functions add the optimistic-concurrency token required by
-- FR-114: the caller sends the token it observed, and a stale token is a
-- VERSION_CONFLICT rather than a silent overwrite.
-- ==============================================================================

SET lock_timeout = '5s';

-- ==============================================================================
-- Read contract
-- Installed apps with their tenant-level settings and per-branch overrides.
-- The version token is a lossless microsecond UTC representation of updatedAt:
-- Prisma returns Date at millisecond precision, which would make a timestamp
-- round-trip conflict on every write.
-- ==============================================================================

CREATE OR REPLACE VIEW platform."v_tenant_app_entitlements" AS
SELECT
  ia."organizationId",
  ia."appId",
  ia."isEnabled",
  ia."settings",
  ia."installedAt",
  to_char(
    ia."updatedAt" AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  ) AS "version",
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'branchId', abc."branchId",
          'isEnabled', abc."isEnabled"
        )
        ORDER BY abc."branchId"
      )
      FROM public."app_branch_configs" abc
      WHERE abc."organizationId" = ia."organizationId"
        AND abc."appId" = ia."appId"
    ),
    '[]'::jsonb
  ) AS "branchOverrides"
FROM public."installed_apps" ia;

COMMENT ON VIEW platform."v_tenant_app_entitlements"
  IS 'Installed apps, tenant settings and branch overrides for the operator entitlement and settings surfaces. The version token is the concurrency key.';

-- ==============================================================================
-- Entitlement write with optimistic concurrency (FR-029, FR-114)
-- ==============================================================================

CREATE OR REPLACE FUNCTION platform.fn_set_entitlement_versioned(
  p_org_id text,
  p_app_id text,
  p_is_enabled boolean,
  p_expected_version text,
  p_actor_id text,
  p_request_id text
) RETURNS TABLE (
  "appId" text,
  "isEnabled" boolean,
  "version" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
#variable_conflict use_column
DECLARE
  v_app_id text := btrim(coalesce(p_app_id, ''));
  v_before_enabled boolean;
  v_before_updated_at timestamptz;
  v_before_version text;
  v_updated_at timestamptz;
  v_version text;
BEGIN
  PERFORM platform.fn_require_capability(p_actor_id, 'platform:entitlements:manage');
  PERFORM platform.fn_assert_request_id(p_request_id);

  IF v_app_id = ''
    OR octet_length(v_app_id) > 64
    OR p_is_enabled IS NULL
    OR btrim(coalesce(p_expected_version, '')) = ''
  THEN
    RAISE EXCEPTION 'VALIDATION_FAILED' USING ERRCODE = 'PT422';
  END IF;

  PERFORM platform.fn_require_tenant(p_org_id);

  SELECT ia."isEnabled", ia."updatedAt"
    INTO v_before_enabled, v_before_updated_at
  FROM public."installed_apps" ia
  WHERE ia."organizationId" = p_org_id
    AND ia."appId" = v_app_id
  FOR UPDATE;

  -- FR-029: the function toggles an existing installation and never creates
  -- one, so an app the tenant does not have cannot be granted here.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNKNOWN_APP' USING ERRCODE = 'PT422';
  END IF;

  v_before_version := to_char(
    v_before_updated_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  );

  IF v_before_version IS DISTINCT FROM btrim(p_expected_version) THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  IF v_before_enabled = p_is_enabled THEN
    RETURN QUERY SELECT v_app_id, v_before_enabled, v_before_version;
    RETURN;
  END IF;

  v_updated_at := clock_timestamp();
  v_version := to_char(
    v_updated_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  );

  -- D-022: wall-clock time, and a version token that can never repeat or move
  -- backwards when two transactions commit inside the same microsecond.
  IF v_version <= v_before_version THEN
    v_updated_at := v_before_updated_at + interval '1 microsecond';
    v_version := to_char(
      v_updated_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    );
  END IF;

  UPDATE public."installed_apps" AS ia
  SET "isEnabled" = p_is_enabled,
      "updatedAt" = v_updated_at
  WHERE ia."organizationId" = p_org_id
    AND ia."appId" = v_app_id;

  PERFORM platform.fn_append_audit(
    p_actor_id,
    'TENANT_ENTITLEMENT_SET',
    'installed_app',
    v_app_id,
    p_org_id,
    jsonb_build_object('isEnabled', v_before_enabled),
    jsonb_build_object('isEnabled', p_is_enabled),
    NULL,
    p_request_id
  );

  RETURN QUERY SELECT v_app_id, p_is_enabled, v_version;
END;
$$;

-- ==============================================================================
-- App-setting write with optimistic concurrency (FR-088, FR-111, FR-114)
-- The audit row records the changed keys, never the values: an app-owned
-- setting may carry tenant personal data and the chain is operator-readable.
-- ==============================================================================

CREATE OR REPLACE FUNCTION platform.fn_set_app_setting_versioned(
  p_org_id text,
  p_app_id text,
  p_settings jsonb,
  p_expected_version text,
  p_actor_id text,
  p_request_id text
) RETURNS TABLE (
  "appId" text,
  "settings" jsonb,
  "version" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
#variable_conflict use_column
DECLARE
  v_app_id text := btrim(coalesce(p_app_id, ''));
  v_before jsonb;
  v_before_updated_at timestamptz;
  v_before_version text;
  v_updated_at timestamptz;
  v_version text;
  v_before_keys jsonb;
  v_after_keys jsonb;
BEGIN
  PERFORM platform.fn_require_capability(p_actor_id, 'platform:entitlements:manage');
  PERFORM platform.fn_assert_request_id(p_request_id);

  IF v_app_id = ''
    OR octet_length(v_app_id) > 64
    OR p_settings IS NULL
    OR jsonb_typeof(p_settings) <> 'object'
    OR btrim(coalesce(p_expected_version, '')) = ''
  THEN
    RAISE EXCEPTION 'SETTINGS_INVALID' USING ERRCODE = 'PT422';
  END IF;

  PERFORM platform.fn_require_tenant(p_org_id);

  SELECT ia."settings", ia."updatedAt"
    INTO v_before, v_before_updated_at
  FROM public."installed_apps" ia
  WHERE ia."organizationId" = p_org_id
    AND ia."appId" = v_app_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNKNOWN_APP' USING ERRCODE = 'PT422';
  END IF;

  v_before_version := to_char(
    v_before_updated_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  );

  IF v_before_version IS DISTINCT FROM btrim(p_expected_version) THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  IF v_before IS NOT DISTINCT FROM p_settings THEN
    RETURN QUERY SELECT v_app_id, v_before, v_before_version;
    RETURN;
  END IF;

  SELECT coalesce(jsonb_agg(t.k ORDER BY t.k), '[]'::jsonb)
    INTO v_before_keys
  FROM jsonb_object_keys(coalesce(v_before, '{}'::jsonb)) AS t(k)
  WHERE (coalesce(v_before, '{}'::jsonb) -> t.k) IS DISTINCT FROM (p_settings -> t.k);

  SELECT coalesce(jsonb_agg(t.k ORDER BY t.k), '[]'::jsonb)
    INTO v_after_keys
  FROM jsonb_object_keys(p_settings) AS t(k)
  WHERE (coalesce(v_before, '{}'::jsonb) -> t.k) IS DISTINCT FROM (p_settings -> t.k);

  v_updated_at := clock_timestamp();
  v_version := to_char(
    v_updated_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  );

  IF v_version <= v_before_version THEN
    v_updated_at := v_before_updated_at + interval '1 microsecond';
    v_version := to_char(
      v_updated_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    );
  END IF;

  UPDATE public."installed_apps" AS ia
  SET "settings" = p_settings,
      "updatedAt" = v_updated_at
  WHERE ia."organizationId" = p_org_id
    AND ia."appId" = v_app_id;

  PERFORM platform.fn_append_audit(
    p_actor_id,
    'TENANT_APP_SETTING_SET',
    'installed_app',
    v_app_id,
    p_org_id,
    jsonb_build_object('settingKeys', v_before_keys),
    jsonb_build_object('settingKeys', v_after_keys),
    NULL,
    p_request_id
  );

  RETURN QUERY SELECT v_app_id, p_settings, v_version;
END;
$$;

COMMENT ON FUNCTION platform.fn_set_entitlement_versioned(text, text, boolean, text, text, text)
  IS 'Toggles an existing installation with an optimistic-concurrency token (FR-029, FR-114) and audits the change.';
COMMENT ON FUNCTION platform.fn_set_app_setting_versioned(text, text, jsonb, text, text, text)
  IS 'Stores validated app settings with an optimistic-concurrency token (FR-088, FR-114) and audits only the changed keys.';

-- ==============================================================================
-- Grants: platform only. The tenant identity has no path to public.installed_apps
-- and no execute on either write function. PUBLIC is revoked explicitly because
-- PostgreSQL grants EXECUTE to PUBLIC by default.
-- ==============================================================================

REVOKE ALL ON platform."v_tenant_app_entitlements" FROM PUBLIC;
REVOKE ALL ON platform."v_tenant_app_entitlements" FROM app_tenant;
GRANT SELECT ON platform."v_tenant_app_entitlements" TO app_platform;

REVOKE ALL ON FUNCTION platform.fn_set_entitlement_versioned(text, text, boolean, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_set_entitlement_versioned(text, text, boolean, text, text, text) FROM app_tenant;
GRANT EXECUTE ON FUNCTION platform.fn_set_entitlement_versioned(text, text, boolean, text, text, text) TO app_platform;

REVOKE ALL ON FUNCTION platform.fn_set_app_setting_versioned(text, text, jsonb, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_set_app_setting_versioned(text, text, jsonb, text, text, text) FROM app_tenant;
GRANT EXECUTE ON FUNCTION platform.fn_set_app_setting_versioned(text, text, jsonb, text, text, text) TO app_platform;
