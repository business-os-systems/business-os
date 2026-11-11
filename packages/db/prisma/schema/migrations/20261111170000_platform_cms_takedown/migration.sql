-- ==============================================================================
-- Platform CMS site takedown (issue #359, FR-132, T122)
--
-- An operator suspends a published site with a recorded reason; the state
-- change, the tenant CMS audit row and the platform audit row commit in one
-- transaction. Restore returns the site to the status recorded by the latest
-- suspension, never to a guessed status. Both functions prove the operator
-- capability inside the database as well as in the API (XVI.1, 5.3 #4).
--
-- app_platform receives no direct cms table grants (DB-2); these SECURITY
-- DEFINER functions are the only write path and are executable only by it.
-- Forward-only migration; DDL only, no backfill. lock_timeout is set.
-- ==============================================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION platform.fn_suspend_cms_site(
  p_org_id text,
  p_site_id text,
  p_expected_status text,
  p_reason text,
  p_actor_id text,
  p_request_id text
) RETURNS TABLE (
  "siteId" text,
  "fromStatus" text,
  "toStatus" text,
  "occurredAt" timestamptz,
  "hostnames" text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform, cms
AS $$
#variable_conflict use_column
DECLARE
  v_from text;
  v_expected text := upper(btrim(coalesce(p_expected_status, '')));
  v_reason text;
  v_occurred timestamptz := clock_timestamp();
  v_hostnames text[];
BEGIN
  PERFORM platform.fn_require_capability(p_actor_id, 'platform:tenants:lifecycle');
  PERFORM platform.fn_assert_request_id(p_request_id);
  v_reason := platform.fn_require_reason(p_reason);

  IF v_expected = '' OR p_org_id IS NULL OR btrim(p_org_id) = '' OR p_site_id IS NULL OR btrim(p_site_id) = '' THEN
    RAISE EXCEPTION 'VALIDATION_FAILED' USING ERRCODE = 'PT422';
  END IF;

  -- The forced tenant policy on every cms table reads this transaction-local
  -- setting; the definer function never runs without a tenant boundary.
  PERFORM set_config('app.current_organization_id', p_org_id, true);

  SELECT s."status"::text INTO v_from
  FROM cms."cms_sites" s
  WHERE s."id" = p_site_id AND s."organizationId" = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SITE_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  IF v_from <> v_expected THEN
    RAISE EXCEPTION 'SITE_STATUS_CHANGED' USING ERRCODE = 'PT409';
  END IF;

  IF v_from NOT IN ('PUBLISHED', 'MAINTENANCE') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE = 'PT422';
  END IF;

  UPDATE cms."cms_sites"
  SET "status" = 'SUSPENDED'::cms."CmsSiteStatus",
      "updatedAt" = v_occurred
  WHERE "id" = p_site_id AND "organizationId" = p_org_id;

  INSERT INTO cms."cms_audit_trails" (
    "id", "organizationId", "siteId", "action", "entityType", "entityId",
    "actorUserId", "changesJson", "createdAt"
  ) VALUES (
    gen_random_uuid()::text, p_org_id, p_site_id, 'SITE_SUSPENDED', 'CmsSite',
    p_site_id, 'operator:' || p_actor_id,
    jsonb_build_object(
      'fromStatus', v_from,
      'toStatus', 'SUSPENDED',
      'reason', v_reason,
      'requestId', p_request_id
    ),
    v_occurred
  );

  PERFORM platform.fn_append_audit(
    p_actor_id, 'SITE_SUSPENDED', 'cms_site', p_site_id, p_org_id,
    jsonb_build_object('status', v_from),
    jsonb_build_object('status', 'SUSPENDED', 'reason', v_reason),
    v_reason, p_request_id
  );

  SELECT COALESCE(array_agg(d."hostname" ORDER BY d."hostname"), ARRAY[]::text[])
  INTO v_hostnames
  FROM cms."cms_domains" d
  WHERE d."organizationId" = p_org_id
    AND d."siteId" = p_site_id
    AND d."status" IN ('ACTIVE', 'PENDING_VERIFICATION');

  -- Clear the transaction-local tenant setting before returning: the caller
  -- must never inherit a tenant boundary from a definer function.
  PERFORM set_config('app.current_organization_id', '', true);

  RETURN QUERY SELECT p_site_id, v_from, 'SUSPENDED'::text, v_occurred, v_hostnames;
END;
$$;

CREATE OR REPLACE FUNCTION platform.fn_restore_cms_site(
  p_org_id text,
  p_site_id text,
  p_expected_status text,
  p_reason text,
  p_actor_id text,
  p_request_id text
) RETURNS TABLE (
  "siteId" text,
  "fromStatus" text,
  "toStatus" text,
  "occurredAt" timestamptz,
  "hostnames" text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform, cms
AS $$
#variable_conflict use_column
DECLARE
  v_from text;
  v_restore_to text;
  v_expected text := upper(btrim(coalesce(p_expected_status, '')));
  v_reason text;
  v_occurred timestamptz := clock_timestamp();
  v_hostnames text[];
BEGIN
  PERFORM platform.fn_require_capability(p_actor_id, 'platform:tenants:lifecycle');
  PERFORM platform.fn_assert_request_id(p_request_id);
  v_reason := platform.fn_require_reason(p_reason);

  IF v_expected <> 'SUSPENDED' OR p_org_id IS NULL OR btrim(p_org_id) = '' OR p_site_id IS NULL OR btrim(p_site_id) = '' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE = 'PT422';
  END IF;

  PERFORM set_config('app.current_organization_id', p_org_id, true);

  SELECT s."status"::text INTO v_from
  FROM cms."cms_sites" s
  WHERE s."id" = p_site_id AND s."organizationId" = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SITE_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  IF v_from <> v_expected THEN
    RAISE EXCEPTION 'SITE_STATUS_CHANGED' USING ERRCODE = 'PT409';
  END IF;

  SELECT a."changesJson"->>'fromStatus' INTO v_restore_to
  FROM cms."cms_audit_trails" a
  WHERE a."organizationId" = p_org_id
    AND a."siteId" = p_site_id
    AND a."action" = 'SITE_SUSPENDED'
  ORDER BY a."createdAt" DESC
  LIMIT 1;

  IF v_restore_to IS NULL OR v_restore_to NOT IN ('PUBLISHED', 'MAINTENANCE') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE = 'PT422';
  END IF;

  UPDATE cms."cms_sites"
  SET "status" = v_restore_to::cms."CmsSiteStatus",
      "updatedAt" = v_occurred
  WHERE "id" = p_site_id AND "organizationId" = p_org_id;

  INSERT INTO cms."cms_audit_trails" (
    "id", "organizationId", "siteId", "action", "entityType", "entityId",
    "actorUserId", "changesJson", "createdAt"
  ) VALUES (
    gen_random_uuid()::text, p_org_id, p_site_id, 'SITE_RESTORED', 'CmsSite',
    p_site_id, 'operator:' || p_actor_id,
    jsonb_build_object(
      'fromStatus', v_from,
      'toStatus', v_restore_to,
      'reason', v_reason,
      'requestId', p_request_id
    ),
    v_occurred
  );

  PERFORM platform.fn_append_audit(
    p_actor_id, 'SITE_RESTORED', 'cms_site', p_site_id, p_org_id,
    jsonb_build_object('status', v_from),
    jsonb_build_object('status', v_restore_to, 'reason', v_reason),
    v_reason, p_request_id
  );

  SELECT COALESCE(array_agg(d."hostname" ORDER BY d."hostname"), ARRAY[]::text[])
  INTO v_hostnames
  FROM cms."cms_domains" d
  WHERE d."organizationId" = p_org_id
    AND d."siteId" = p_site_id
    AND d."status" IN ('ACTIVE', 'PENDING_VERIFICATION');

  PERFORM set_config('app.current_organization_id', '', true);

  RETURN QUERY SELECT p_site_id, v_from, v_restore_to, v_occurred, v_hostnames;
END;
$$;

REVOKE ALL ON FUNCTION platform.fn_suspend_cms_site(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_restore_cms_site(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_suspend_cms_site(text, text, text, text, text, text) FROM app_tenant;
REVOKE ALL ON FUNCTION platform.fn_restore_cms_site(text, text, text, text, text, text) FROM app_tenant;
GRANT EXECUTE ON FUNCTION platform.fn_suspend_cms_site(text, text, text, text, text, text) TO app_platform;
GRANT EXECUTE ON FUNCTION platform.fn_restore_cms_site(text, text, text, text, text, text) TO app_platform;
