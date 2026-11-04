-- ==============================================================================
-- Audited notification contacts (issue #222 review, SCR-004)
-- Forward-only: the contact function shipped in
-- 20261104140000_platform_tenant_admin_contacts and is superseded here.
--
-- The first version returned addresses with no actor, no request id and no
-- audit row, unlike fn_tenant_pii (which fails closed when its audit cannot be
-- written). Every address read is now attributable to the operator whose
-- lifecycle change caused it, and the audience excludes unverified addresses.
-- The audit records the recipient count only: an address is personal data and
-- must not enter the audit chain.
-- ==============================================================================

SET lock_timeout = '5s';

DROP FUNCTION IF EXISTS platform.fn_tenant_admin_contacts(text);

CREATE OR REPLACE FUNCTION platform.fn_tenant_admin_contacts(
  p_org_id text,
  p_actor_id text,
  p_request_id text
) RETURNS TABLE ("email" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE
  -- A notification is an operational courtesy, not a broadcast channel.
  c_max_recipients CONSTANT integer := 50;
  v_emails text[];
BEGIN
  PERFORM platform.fn_require_tenant(p_org_id);
  PERFORM platform.fn_assert_request_id(p_request_id);

  SELECT COALESCE(array_agg(contact."email"), ARRAY[]::text[])
    INTO v_emails
  FROM (
    SELECT DISTINCT u."email"::text AS "email"
    FROM public."user_organizations" uo
    JOIN public."users" u
      ON u."id" = uo."userId"
    JOIN public."user_branch_roles" ubr
      ON ubr."userId" = u."id"
     AND ubr."organizationId" = p_org_id
    JOIN public."role_permissions" rp
      ON rp."roleId" = ubr."roleId"
    JOIN public."permissions" p
      ON p."id" = rp."permissionId"
    WHERE uo."organizationId" = p_org_id
      AND uo."status" = 'ACTIVE'
      AND u."emailVerified" = true
      AND p."action" IN ('*', 'core:*', 'core:users:manage')
    ORDER BY "email"
    LIMIT c_max_recipients
  ) AS contact;

  -- The audit is written before any address leaves the function (5.3 #5).
  PERFORM platform.fn_append_audit(
    p_actor_id,
    'TENANT_NOTIFICATION_CONTACTS_READ',
    'organization',
    p_org_id,
    p_org_id,
    NULL,
    jsonb_build_object('recipientCount', COALESCE(array_length(v_emails, 1), 0)),
    NULL,
    p_request_id
  );

  RETURN QUERY SELECT unnest(v_emails) AS "email";
END;
$$;

REVOKE ALL ON FUNCTION platform.fn_tenant_admin_contacts(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_tenant_admin_contacts(text, text, text) FROM app_tenant;
GRANT EXECUTE ON FUNCTION platform.fn_tenant_admin_contacts(text, text, text) TO app_platform;

COMMENT ON FUNCTION platform.fn_tenant_admin_contacts(text, text, text)
  IS 'Addresses the verified tenant administrators (capability-derived, capped) for a lifecycle notification, attributed to the operator and audited before returning.';
