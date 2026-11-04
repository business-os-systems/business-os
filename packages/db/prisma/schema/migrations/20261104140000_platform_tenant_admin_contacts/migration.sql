-- ==============================================================================
-- Tenant administrator contacts for lifecycle notifications (T054)
-- Issue #222. Forward-only; the audited-functions migration is already applied.
--
-- A restore must notify the tenant's administrators (FR-018). app_platform has
-- no public-schema grant (DB-2), so the addressing data comes through this
-- definer function rather than a direct read of public.users.
--
-- The audience is capability-derived, never a role title: a member is an
-- administrator when any assigned role carries the wildcard, core:* or
-- core:users:manage permission. No name, phone, or membership detail leaves
-- the function - only the address a notification must be delivered to.
-- ==============================================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION platform.fn_tenant_admin_contacts(
  p_org_id text
) RETURNS TABLE ("email" text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
BEGIN
  PERFORM platform.fn_require_tenant(p_org_id);

  RETURN QUERY
  SELECT DISTINCT u."email"::text
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
    AND p."action" IN ('*', 'core:*', 'core:users:manage')
  ORDER BY 1
  LIMIT 50;
END;
$$;

REVOKE ALL ON FUNCTION platform.fn_tenant_admin_contacts(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.fn_tenant_admin_contacts(text) FROM app_tenant;
GRANT EXECUTE ON FUNCTION platform.fn_tenant_admin_contacts(text) TO app_platform;

COMMENT ON FUNCTION platform.fn_tenant_admin_contacts(text)
  IS 'Addresses the tenant administrators (capability-derived, capped at 50) for a lifecycle notification. Never returns names or other personal data.';
