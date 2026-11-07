-- ==============================================================================
-- Quota enforcement gate (T094, FR-025, FR-026, FR-091)
--
-- This is the single definition of the tenant-callable gate;
-- 20261107150000 owns the usage view and no longer creates the function. The
-- view projects resourceKey as varchar(64), so the gate casts to the declared
-- text return type instead of relying on an implicit widening.
-- ==============================================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_assert_quota_available(
  p_org_id text,
  p_resource_key text,
  p_delta bigint DEFAULT 1
) RETURNS TABLE (
  "resourceKey" text,
  "limitValue" bigint,
  "currentValue" bigint,
  "unit" text,
  "isMeasurable" boolean,
  "isEnforced" boolean,
  "allowed" boolean,
  "isOverLimit" boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  v_session_org text := current_setting('app.current_organization_id', true);
  v_row record;
BEGIN
  IF v_session_org IS NULL
    OR btrim(v_session_org) = ''
    OR btrim(v_session_org) <> btrim(coalesce(p_org_id, ''))
  THEN
    RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED' USING ERRCODE = 'PT403';
  END IF;

  IF p_delta IS NULL OR p_delta < 0 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED' USING ERRCODE = 'PT422';
  END IF;

  IF btrim(coalesce(p_resource_key, '')) = '' THEN
    RAISE EXCEPTION 'UNKNOWN_RESOURCE_KEY' USING ERRCODE = 'PT422';
  END IF;

  PERFORM platform.fn_require_tenant(p_org_id);

  -- Serialize creates for one tenant and resource until the write commits.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_org_id || ':' || p_resource_key, 0)
  );

  SELECT
    u."resourceKey",
    u."limitValue",
    u."currentValue",
    u."unit",
    u."isMeasurable",
    u."isEnforced"
  INTO v_row
  FROM platform."v_tenant_usage" u
  WHERE u."organizationId" = p_org_id
    AND u."resourceKey" = p_resource_key;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT
    v_row."resourceKey"::text,
    v_row."limitValue",
    v_row."currentValue",
    v_row."unit"::text,
    v_row."isMeasurable",
    v_row."isEnforced",
    (
      NOT v_row."isEnforced"
      OR NOT v_row."isMeasurable"
      OR (v_row."currentValue" + p_delta) <= v_row."limitValue"
    ),
    (
      v_row."currentValue" IS NOT NULL
      AND v_row."currentValue" > v_row."limitValue"
    );
END;
$$;

COMMENT ON FUNCTION public.fn_assert_quota_available(text, text, bigint)
  IS 'Tenant-callable quota gate: returns the measured consumption and whether a write may proceed. Enforces only measurable, enforced limits and never deletes content (FR-025, FR-026, FR-091).';

REVOKE ALL ON FUNCTION public.fn_assert_quota_available(text, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_assert_quota_available(text, text, bigint) FROM app_platform;
GRANT EXECUTE ON FUNCTION public.fn_assert_quota_available(text, text, bigint) TO app_tenant;
