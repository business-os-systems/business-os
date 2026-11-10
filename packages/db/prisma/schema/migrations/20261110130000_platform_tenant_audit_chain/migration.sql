-- ==============================================================================
-- Tenant-attributed audit-chain verification (issue #312, FR-042)
--
-- D-019 defines one global chain ordered by (occurredAt, id). A filtered
-- per-tenant walk cannot prove the links that cross tenants, so this function
-- never pretends a tenant owns an independent chain. It walks the global order
-- and validates every row owned by the requested tenant against its actual
-- predecessor. The result is a tenant-attributed report that complements,
-- never replaces, platform.fn_verify_audit_chain:
--
--   * the row's stored prevHash must equal the preceding global recordHash;
--   * the row's stored recordHash must still match its recomputed hash.
--
-- A break in another tenant's row is therefore reported by the global verifier
-- without being attributed to an intact tenant. A rewritten predecessor hash
-- breaks the incoming link and is attributed to the tenant row that cannot be
-- anchored.
-- ==============================================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION platform.fn_verify_audit_chain_for_tenant(
  p_actor_id text,
  p_organization_id text,
  p_request_id text
) RETURNS TABLE (
  "organizationId" text,
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
  v_organization_id text := btrim(coalesce(p_organization_id, ''));
  v_expected_prev text := NULL;
  v_current record;
  v_checked integer := 0;
  v_verified boolean := true;
  v_first_broken text := NULL;
BEGIN
  PERFORM platform.fn_require_capability(p_actor_id, 'platform:audit:read');
  PERFORM platform.fn_assert_request_id(p_request_id);

  IF v_organization_id = '' THEN
    RAISE EXCEPTION 'VALIDATION_FAILED' USING ERRCODE = 'PT422';
  END IF;

  -- FR-042 is a full walk; cap it so one caller cannot pin the database.
  PERFORM set_config('statement_timeout', '15000', true);

  FOR v_current IN
    SELECT a.*
    FROM platform.audit_events a
    ORDER BY a."occurredAt" ASC, a."id" ASC
  LOOP
    IF v_current."organizationId" = v_organization_id THEN
      v_checked := v_checked + 1;

      IF v_current."prevHash" IS DISTINCT FROM v_expected_prev
         OR platform.fn_audit_hash(
              v_current."prevHash",
              v_current."actorOperatorId",
              v_current."action",
              v_current."entityType",
              v_current."entityId",
              v_current."organizationId",
              v_current."before",
              v_current."after",
              v_current."reason",
              v_current."requestId",
              v_current."occurredAt"
            ) IS DISTINCT FROM v_current."recordHash" THEN
        IF v_first_broken IS NULL THEN
          v_verified := false;
          v_first_broken := v_current."id"::text;
        END IF;
      END IF;
    END IF;

    v_expected_prev := v_current."recordHash";
  END LOOP;

  -- FR-044: the verification itself is a sensitive read and is audited.
  PERFORM platform.fn_append_audit(
    p_actor_id,
    'AUDIT_CHAIN_VERIFIED',
    'platform.audit_events',
    v_organization_id,
    v_organization_id,
    NULL,
    jsonb_build_object(
      'scope', 'tenant',
      'verified', v_verified,
      'checkedCount', v_checked,
      'firstBrokenId', v_first_broken
    ),
    NULL,
    p_request_id
  );

  RETURN QUERY SELECT v_organization_id, v_verified, v_checked, v_first_broken;
END;
$$;

REVOKE ALL ON FUNCTION platform.fn_verify_audit_chain_for_tenant(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_verify_audit_chain_for_tenant(text, text, text) FROM app_tenant;
GRANT EXECUTE ON FUNCTION platform.fn_verify_audit_chain_for_tenant(text, text, text) TO app_platform;

COMMENT ON FUNCTION platform.fn_verify_audit_chain_for_tenant(text, text, text)
  IS 'Tenant-attributed report over the global D-019 chain: validates every tenant-owned row against its actual predecessor and audits the verification (FR-042). Complements, never replaces, the global verification.';
