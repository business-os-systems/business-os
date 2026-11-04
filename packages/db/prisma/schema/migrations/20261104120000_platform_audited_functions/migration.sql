-- ==============================================================================
-- Platform audited functions and the tenant usage view (T015 usage, T016)
-- Issue #248. Forward-only; the foundation migration is already applied.
--
-- Every public function:
--   1. is SECURITY DEFINER with a fixed search_path, because app_platform has
--      no public-schema grant (DB-2) and tenant personal data must never be
--      readable through the runtime role;
--   2. proves the actor's capability from platform.operator_capabilities
--      inside the same transaction - the API checks too, the database does not
--      trust the caller (XVI.1);
--   3. appends its own audit row through platform.fn_append_audit, so the
--      mutation and its audit record commit or roll back together (5.3 #4);
--   4. is executable only by app_platform: PUBLIC and app_tenant are revoked.
-- ==============================================================================

SET lock_timeout = '5s';

-- ==============================================================================
-- Private helpers
-- ==============================================================================

CREATE OR REPLACE FUNCTION platform.fn_operator_has_capability(
  p_actor_id text,
  p_capability text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM platform.operators o
    JOIN platform.operator_capabilities oc
      ON oc."operatorId" = o."id"
    WHERE o."id" = p_actor_id
      AND o."status" = 'ACTIVE'
      AND oc."capability" = p_capability
      AND oc."revokedAt" IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION platform.fn_require_capability(
  p_actor_id text,
  p_capability text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
BEGIN
  IF p_actor_id IS NULL OR btrim(p_actor_id) = '' THEN
    RAISE EXCEPTION 'CAPABILITY_DENIED' USING ERRCODE = 'PT403';
  END IF;

  IF NOT platform.fn_operator_has_capability(p_actor_id, p_capability) THEN
    RAISE EXCEPTION 'CAPABILITY_DENIED' USING ERRCODE = 'PT403';
  END IF;
END;
$$;

-- One append path for every database-written audit row. The BEFORE INSERT
-- trigger on platform.audit_events computes prevHash and recordHash, so this
-- helper only supplies the PENDING sentinel the trigger replaces.
CREATE OR REPLACE FUNCTION platform.fn_append_audit(
  p_actor_id text,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_organization_id text,
  p_before jsonb,
  p_after jsonb,
  p_reason text,
  p_request_id text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE
  v_id text := gen_random_uuid()::text;
BEGIN
  INSERT INTO platform.audit_events (
    "id",
    "actorOperatorId",
    "action",
    "entityType",
    "entityId",
    "organizationId",
    "before",
    "after",
    "reason",
    "requestId",
    "recordHash",
    "occurredAt"
  ) VALUES (
    v_id,
    p_actor_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_organization_id,
    p_before,
    p_after,
    p_reason,
    p_request_id,
    'PENDING',
    clock_timestamp()
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION platform.fn_assert_request_id(
  p_request_id text
) RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_request_id IS NULL OR btrim(p_request_id) = '' THEN
    RAISE EXCEPTION 'VALIDATION_FAILED' USING ERRCODE = 'PT422';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION platform.fn_trim_reason(
  p_reason text
) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_reason IS NULL
      OR btrim(p_reason) = ''
      OR octet_length(btrim(p_reason)) > 255
    THEN NULL
    ELSE btrim(p_reason)
  END;
$$;

CREATE OR REPLACE FUNCTION platform.fn_require_reason(
  p_reason text
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_reason text := platform.fn_trim_reason(p_reason);
BEGIN
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_FAILED' USING ERRCODE = 'PT422';
  END IF;

  RETURN v_reason;
END;
$$;

CREATE OR REPLACE FUNCTION platform.fn_require_pii_reason(
  p_reason text
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_reason text := platform.fn_trim_reason(p_reason);
BEGIN
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'PII_REASON_REQUIRED' USING ERRCODE = 'PT422';
  END IF;

  RETURN v_reason;
END;
$$;

-- Shared tenant existence check (FR-013/FR-024/FR-029): every mutation names a
-- real tenant before it locks or writes anything.
CREATE OR REPLACE FUNCTION platform.fn_require_tenant(
  p_org_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o."id" = p_org_id
  ) THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;
END;
$$;

-- ==============================================================================
-- Tenant lifecycle
-- Transition matrix (LLD 7): Platform may not invent a new state. The caller
-- passes the status it observed (contract expectedStatus); a mismatch is a
-- LIFECYCLE_CONFLICT, never a silent overwrite. Restore returns the tenant to
-- the status recorded before the suspension.
-- ==============================================================================

CREATE OR REPLACE FUNCTION platform.fn_set_tenant_status(
  p_org_id text,
  p_to_status text,
  p_expected_status text,
  p_reason text,
  p_actor_id text,
  p_request_id text
) RETURNS TABLE (
  "lifecycleEventId" text,
  "fromStatus" text,
  "toStatus" text,
  "occurredAt" timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
#variable_conflict use_column
DECLARE
  v_from text;
  v_to text := upper(btrim(coalesce(p_to_status, '')));
  v_expected text := upper(btrim(coalesce(p_expected_status, '')));
  v_reason text;
  v_event_id text := gen_random_uuid()::text;
  v_occurred timestamptz := now();
BEGIN
  PERFORM platform.fn_require_capability(p_actor_id, 'platform:tenants:lifecycle');
  PERFORM platform.fn_assert_request_id(p_request_id);
  v_reason := platform.fn_require_reason(p_reason);

  IF v_expected = '' THEN
    RAISE EXCEPTION 'VALIDATION_FAILED' USING ERRCODE = 'PT422';
  END IF;

  IF v_to NOT IN ('ACTIVE', 'TRIAL', 'PAST_DUE', 'SUSPENDED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE = 'PT422';
  END IF;

  SELECT o."status"::text INTO v_from
  FROM public.organizations o
  WHERE o."id" = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  IF v_from <> v_expected THEN
    RAISE EXCEPTION 'LIFECYCLE_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  IF v_from = v_to THEN
    RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE = 'PT422';
  END IF;

  IF NOT (
       (v_from = 'ACTIVE'    AND v_to IN ('SUSPENDED', 'ARCHIVED'))
    OR (v_from = 'TRIAL'     AND v_to IN ('ACTIVE', 'PAST_DUE', 'SUSPENDED', 'ARCHIVED'))
    OR (v_from = 'PAST_DUE'  AND v_to IN ('ACTIVE', 'TRIAL', 'SUSPENDED', 'ARCHIVED'))
    OR (v_from = 'SUSPENDED' AND v_to IN ('ACTIVE', 'TRIAL', 'PAST_DUE', 'ARCHIVED'))
  ) THEN
    RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE = 'PT422';
  END IF;

  UPDATE public.organizations
  SET "status" = v_to::public."OrgStatus",
      "updatedAt" = v_occurred
  WHERE "id" = p_org_id;

  INSERT INTO platform.lifecycle_events (
    "id",
    "organizationId",
    "fromStatus",
    "toStatus",
    "reason",
    "actorOperatorId",
    "requestId",
    "occurredAt"
  ) VALUES (
    v_event_id,
    p_org_id,
    v_from,
    v_to,
    v_reason,
    p_actor_id,
    p_request_id,
    v_occurred
  );

  PERFORM platform.fn_append_audit(
    p_actor_id,
    'TENANT_STATUS_CHANGED',
    'organization',
    p_org_id,
    p_org_id,
    jsonb_build_object('status', v_from),
    jsonb_build_object('status', v_to),
    v_reason,
    p_request_id
  );

  RETURN QUERY SELECT v_event_id, v_from, v_to, v_occurred;
END;
$$;

-- ==============================================================================
-- Quotas (FR-024, FR-026, FR-027)
-- The resource key vocabulary lives in @suite/core QUOTA_KEYS; the database
-- stores it verbatim and cannot validate the registry, so the API rejects an
-- unknown key before calling (UNKNOWN_RESOURCE_KEY).
-- ==============================================================================

CREATE OR REPLACE FUNCTION platform.fn_set_quota(
  p_org_id text,
  p_resource_key text,
  p_limit_value bigint,
  p_is_enforced boolean,
  p_actor_id text,
  p_request_id text
) RETURNS TABLE (
  "resourceKey" text,
  "limitValue" bigint,
  "isEnforced" boolean,
  "updatedAt" timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
#variable_conflict use_column
DECLARE
  v_key text := btrim(coalesce(p_resource_key, ''));
  v_before jsonb;
  v_after jsonb;
  v_updated_at timestamptz := now();
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

  -- FR-091: storage is not metered, so a storage limit may be recorded but
  -- never enforced. Enforcing it would block writes on an unmeasurable value.
  IF v_key = 'media.storage' AND coalesce(p_is_enforced, true) THEN
    RAISE EXCEPTION 'VALIDATION_FAILED' USING ERRCODE = 'PT422';
  END IF;

  SELECT jsonb_build_object(
           'limitValue', q."limitValue"::text,
           'isEnforced', q."isEnforced"
         )
  INTO v_before
  FROM platform.quotas q
  WHERE q."organizationId" = p_org_id
    AND q."resourceKey" = v_key
  FOR UPDATE;

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

  v_after := jsonb_build_object(
    'limitValue', p_limit_value::text,
    'isEnforced', coalesce(p_is_enforced, true)
  );

  PERFORM platform.fn_append_audit(
    p_actor_id,
    'TENANT_QUOTA_SET',
    'quota',
    v_key,
    p_org_id,
    v_before,
    v_after,
    NULL,
    p_request_id
  );

  RETURN QUERY
  SELECT q."resourceKey"::text, q."limitValue", q."isEnforced", q."updatedAt"
  FROM platform.quotas q
  WHERE q."organizationId" = p_org_id
    AND q."resourceKey" = v_key;
END;
$$;

-- ==============================================================================
-- Entitlements and per-tenant application settings
-- FR-029: an entitlement may never grant an app the tenant does not have.
-- The function therefore refuses to create an installation. Registry
-- membership and the app-owned settings schema are validated by the API, which
-- is the only layer that can see the compiled manifests (DECISIONS D-024).
-- ==============================================================================

CREATE OR REPLACE FUNCTION platform.fn_set_entitlement(
  p_org_id text,
  p_app_id text,
  p_is_enabled boolean,
  p_actor_id text,
  p_request_id text
) RETURNS TABLE (
  "appId" text,
  "isEnabled" boolean,
  "updatedAt" timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
#variable_conflict use_column
DECLARE
  v_app_id text := btrim(coalesce(p_app_id, ''));
  v_before boolean;
  v_updated_at timestamptz := now();
BEGIN
  PERFORM platform.fn_require_capability(p_actor_id, 'platform:entitlements:manage');
  PERFORM platform.fn_assert_request_id(p_request_id);

  IF v_app_id = '' OR p_is_enabled IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_FAILED' USING ERRCODE = 'PT422';
  END IF;

  PERFORM platform.fn_require_tenant(p_org_id);

  SELECT ia."isEnabled" INTO v_before
  FROM public.installed_apps ia
  WHERE ia."organizationId" = p_org_id
    AND ia."appId" = v_app_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNKNOWN_APP' USING ERRCODE = 'PT422';
  END IF;

  UPDATE public.installed_apps AS ia
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
    jsonb_build_object('isEnabled', v_before),
    jsonb_build_object('isEnabled', p_is_enabled),
    NULL,
    p_request_id
  );

  RETURN QUERY SELECT v_app_id, p_is_enabled, v_updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION platform.fn_set_app_setting(
  p_org_id text,
  p_app_id text,
  p_settings jsonb,
  p_actor_id text,
  p_request_id text
) RETURNS TABLE (
  "appId" text,
  "settings" jsonb,
  "updatedAt" timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
#variable_conflict use_column
DECLARE
  v_app_id text := btrim(coalesce(p_app_id, ''));
  v_before jsonb;
  v_updated_at timestamptz := now();
BEGIN
  PERFORM platform.fn_require_capability(p_actor_id, 'platform:entitlements:manage');
  PERFORM platform.fn_assert_request_id(p_request_id);

  IF v_app_id = '' OR p_settings IS NULL OR jsonb_typeof(p_settings) <> 'object' THEN
    RAISE EXCEPTION 'SETTINGS_INVALID' USING ERRCODE = 'PT422';
  END IF;

  PERFORM platform.fn_require_tenant(p_org_id);

  SELECT ia."settings" INTO v_before
  FROM public.installed_apps ia
  WHERE ia."organizationId" = p_org_id
    AND ia."appId" = v_app_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNKNOWN_APP' USING ERRCODE = 'PT422';
  END IF;

  UPDATE public.installed_apps AS ia
  SET "settings" = p_settings,
      "updatedAt" = v_updated_at
  WHERE ia."organizationId" = p_org_id
    AND ia."appId" = v_app_id;

  -- Audit the setting keys, never the values: an app-owned schema may carry
  -- tenant PII, and audit rows are readable by app_platform (D-024).
  PERFORM platform.fn_append_audit(
    p_actor_id,
    'TENANT_APP_SETTING_SET',
    'installed_app',
    v_app_id,
    p_org_id,
    jsonb_build_object(
      'settingKeys',
      coalesce(
        (SELECT jsonb_agg(k ORDER BY k)
         FROM jsonb_object_keys(coalesce(v_before, '{}'::jsonb)) AS k),
        '[]'::jsonb
      )
    ),
    jsonb_build_object(
      'settingKeys',
      coalesce(
        (SELECT jsonb_agg(k ORDER BY k)
         FROM jsonb_object_keys(p_settings) AS k),
        '[]'::jsonb
      )
    ),
    NULL,
    p_request_id
  );

  RETURN QUERY SELECT v_app_id, p_settings, v_updated_at;
END;
$$;

-- ==============================================================================
-- Personal data (FR-013, FR-043)
-- The elevated read writes its audit row before any row is returned, so a
-- failed audit aborts the read instead of leaking data silently.
-- ==============================================================================

CREATE OR REPLACE FUNCTION platform.fn_tenant_pii(
  p_org_id text,
  p_actor_id text,
  p_reason text,
  p_request_id text
) RETURNS TABLE (
  "userId" text,
  "name" text,
  "email" text,
  "membershipStatus" text,
  "joinedAt" timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
#variable_conflict use_column
DECLARE
  v_reason text;
  v_member_count integer;
BEGIN
  PERFORM platform.fn_require_capability(p_actor_id, 'platform:pii:read');
  PERFORM platform.fn_assert_request_id(p_request_id);
  v_reason := platform.fn_require_pii_reason(p_reason);

  PERFORM platform.fn_require_tenant(p_org_id);

  SELECT count(*)::integer INTO v_member_count
  FROM public.user_organizations uo
  WHERE uo."organizationId" = p_org_id
    AND uo."status" = 'ACTIVE';

  -- One unbounded read would pull every member into the API process; paging
  -- belongs to the API slice, so the database refuses an oversized read.
  IF v_member_count > 1000 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED' USING ERRCODE = 'PT422';
  END IF;

  PERFORM platform.fn_append_audit(
    p_actor_id,
    'TENANT_PII_READ',
    'organization',
    p_org_id,
    p_org_id,
    NULL,
    jsonb_build_object('memberCount', v_member_count),
    v_reason,
    p_request_id
  );

  RETURN QUERY
  SELECT u."id"::text, u."name"::text, u."email"::text, uo."status"::text, uo."createdAt"
  FROM public.user_organizations uo
  JOIN public.users u ON u."id" = uo."userId"
  WHERE uo."organizationId" = p_org_id
    AND uo."status" = 'ACTIVE'
  ORDER BY u."name", u."id"
  LIMIT 1000;
END;
$$;

-- ==============================================================================
-- Audit chain verification (FR-042)
-- D-019 defines one global chain ordered by (occurredAt, id); a per-tenant walk
-- cannot validate links that cross tenants, so the walk is always global.
-- ==============================================================================

CREATE OR REPLACE FUNCTION platform.fn_verify_audit_chain(
  p_actor_id text,
  p_request_id text
) RETURNS TABLE (
  "verified" boolean,
  "checkedCount" integer,
  "firstBrokenId" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
#variable_conflict use_column
DECLARE
  expected_prev text := NULL;
  current_row record;
  computed text;
  checked integer := 0;
  v_verified boolean := true;
  v_first_broken text := NULL;
BEGIN
  PERFORM platform.fn_require_capability(p_actor_id, 'platform:audit:read');
  PERFORM platform.fn_assert_request_id(p_request_id);

  -- FR-042 is a full walk; cap it so one caller cannot pin the database.
  PERFORM set_config('statement_timeout', '15000', true);

  FOR current_row IN
    SELECT a.*
    FROM platform.audit_events a
    ORDER BY a."occurredAt" ASC, a."id" ASC
  LOOP
    checked := checked + 1;

    IF current_row."prevHash" IS DISTINCT FROM expected_prev THEN
      v_verified := false;
      v_first_broken := current_row."id"::text;
      EXIT;
    END IF;

    computed := platform.fn_audit_hash(
      expected_prev,
      current_row."actorOperatorId",
      current_row."action",
      current_row."entityType",
      current_row."entityId",
      current_row."organizationId",
      current_row."before",
      current_row."after",
      current_row."reason",
      current_row."requestId",
      current_row."occurredAt"
    );

    IF computed IS DISTINCT FROM current_row."recordHash" THEN
      v_verified := false;
      v_first_broken := current_row."id"::text;
      EXIT;
    END IF;

    expected_prev := current_row."recordHash";
  END LOOP;

  -- FR-044: the verification itself is a sensitive read and is audited.
  PERFORM platform.fn_append_audit(
    p_actor_id,
    'AUDIT_CHAIN_VERIFIED',
    'platform.audit_events',
    'global',
    NULL,
    NULL,
    jsonb_build_object(
      'verified', v_verified,
      'checkedCount', checked,
      'firstBrokenId', v_first_broken
    ),
    NULL,
    p_request_id
  );

  RETURN QUERY SELECT v_verified, checked, v_first_broken;
END;
$$;

-- ==============================================================================
-- Tenant usage view (T015 usage, FR-028, FR-091)
-- Measured only where a real source exists. media.storage stays NULL so the UI
-- reports it as unavailable instead of zero. cms.pages and cms.custom_domains
-- read the Website Builder tables documented in the control-surface inventory.
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
          AND uo."status" = 'ACTIVE'
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
  m."limitUpdatedAt"
FROM measured m;

COMMENT ON VIEW platform."v_tenant_usage"
  IS 'Per tenant and quota resource: configured limit plus consumption where a source exists; NULL consumption means not measurable (FR-091).';

-- ==============================================================================
-- Grants (XV.2, DB-2)
-- Public functions: app_platform only. Helpers stay private to the owner so a
-- caller cannot append an arbitrary audit row or bypass a capability check.
-- ==============================================================================

REVOKE ALL ON FUNCTION platform.fn_operator_has_capability(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_require_capability(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_append_audit(text, text, text, text, text, jsonb, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_assert_request_id(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_trim_reason(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_require_reason(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_require_pii_reason(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_require_tenant(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.fn_operator_has_capability(text, text) FROM app_tenant;
REVOKE ALL ON FUNCTION platform.fn_require_capability(text, text) FROM app_tenant;
REVOKE ALL ON FUNCTION platform.fn_append_audit(text, text, text, text, text, jsonb, jsonb, text, text) FROM app_tenant;
REVOKE ALL ON FUNCTION platform.fn_assert_request_id(text) FROM app_tenant;
REVOKE ALL ON FUNCTION platform.fn_trim_reason(text) FROM app_tenant;
REVOKE ALL ON FUNCTION platform.fn_require_reason(text) FROM app_tenant;
REVOKE ALL ON FUNCTION platform.fn_require_pii_reason(text) FROM app_tenant;
REVOKE ALL ON FUNCTION platform.fn_require_tenant(text) FROM app_tenant;

REVOKE ALL ON FUNCTION platform.fn_set_tenant_status(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_set_quota(text, text, bigint, boolean, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_set_entitlement(text, text, boolean, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_set_app_setting(text, text, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_tenant_pii(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_verify_audit_chain(text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION platform.fn_set_tenant_status(text, text, text, text, text, text) FROM app_tenant;
REVOKE ALL ON FUNCTION platform.fn_set_quota(text, text, bigint, boolean, text, text) FROM app_tenant;
REVOKE ALL ON FUNCTION platform.fn_set_entitlement(text, text, boolean, text, text) FROM app_tenant;
REVOKE ALL ON FUNCTION platform.fn_set_app_setting(text, text, jsonb, text, text) FROM app_tenant;
REVOKE ALL ON FUNCTION platform.fn_tenant_pii(text, text, text, text) FROM app_tenant;
REVOKE ALL ON FUNCTION platform.fn_verify_audit_chain(text, text) FROM app_tenant;

GRANT EXECUTE ON FUNCTION platform.fn_set_tenant_status(text, text, text, text, text, text) TO app_platform;
GRANT EXECUTE ON FUNCTION platform.fn_set_quota(text, text, bigint, boolean, text, text) TO app_platform;
GRANT EXECUTE ON FUNCTION platform.fn_set_entitlement(text, text, boolean, text, text) TO app_platform;
GRANT EXECUTE ON FUNCTION platform.fn_set_app_setting(text, text, jsonb, text, text) TO app_platform;
GRANT EXECUTE ON FUNCTION platform.fn_tenant_pii(text, text, text, text) TO app_platform;
GRANT EXECUTE ON FUNCTION platform.fn_verify_audit_chain(text, text) TO app_platform;

REVOKE ALL ON platform."v_tenant_usage" FROM PUBLIC;
GRANT SELECT ON platform."v_tenant_usage" TO app_platform;
REVOKE ALL ON platform."v_tenant_usage" FROM app_tenant;

COMMENT ON FUNCTION platform.fn_set_tenant_status(text, text, text, text, text, text)
  IS 'Applies an allowed OrgStatus transition, records a lifecycle event and audits it. The observed status must match expectedStatus (LIFECYCLE_CONFLICT otherwise).';
COMMENT ON FUNCTION platform.fn_set_quota(text, text, bigint, boolean, text, text)
  IS 'Upserts a per-tenant quota and audits before/after. Refuses to enforce the unmeasurable storage key (FR-091).';
COMMENT ON FUNCTION platform.fn_set_entitlement(text, text, boolean, text, text)
  IS 'Enables or disables an installed app and audits the change. Refuses to create an installation (FR-029).';
COMMENT ON FUNCTION platform.fn_set_app_setting(text, text, jsonb, text, text)
  IS 'Stores app settings on an existing installation and audits the changed keys, never the values.';
COMMENT ON FUNCTION platform.fn_tenant_pii(text, text, text, text)
  IS 'Elevated read of active member contact data (FR-013). Requires platform:pii:read and a reason; audits before returning rows.';
COMMENT ON FUNCTION platform.fn_verify_audit_chain(text, text)
  IS 'Recomputes the global D-019 audit chain, audits the verification and returns the first broken row id (FR-042).';
