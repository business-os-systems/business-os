SET lock_timeout = '5s';

-- The audit chain is append-only for app_platform. A BEFORE INSERT trigger
-- computes prevHash and recordHash, so the runtime role never needs UPDATE.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

CREATE OR REPLACE FUNCTION platform.fn_audit_hash(
  p_prev text,
  p_actor text,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_organization_id text,
  p_before jsonb,
  p_after jsonb,
  p_reason text,
  p_request_id text,
  p_occurred_at timestamptz
) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(public.digest(
    (octet_length(coalesce(p_prev, 'GENESIS')) || ':' || coalesce(p_prev, 'GENESIS')) ||
    (octet_length(coalesce(p_actor, '')) || ':' || coalesce(p_actor, '')) ||
    (octet_length(p_action) || ':' || p_action) ||
    (octet_length(p_entity_type) || ':' || p_entity_type) ||
    (octet_length(p_entity_id) || ':' || p_entity_id) ||
    (octet_length(coalesce(p_organization_id, '')) || ':' || coalesce(p_organization_id, '')) ||
    (octet_length(coalesce(p_before::text, '')) || ':' || coalesce(p_before::text, '')) ||
    (octet_length(coalesce(p_after::text, '')) || ':' || coalesce(p_after::text, '')) ||
    (octet_length(coalesce(p_reason, '')) || ':' || coalesce(p_reason, '')) ||
    (octet_length(p_request_id) || ':' || p_request_id) ||
    (octet_length(to_char(p_occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) || ':' || to_char(p_occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    'sha256'
  ), 'hex');
$$;

REVOKE ALL ON FUNCTION platform.fn_audit_hash(text, text, text, text, text, text, jsonb, jsonb, text, text, timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION platform.fn_audit_append()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE
  previous_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock(724001);

  SELECT "recordHash" INTO previous_hash
  FROM platform.audit_events
  ORDER BY "occurredAt" DESC, "id" DESC
  LIMIT 1;

  NEW."prevHash" := previous_hash;
  NEW."recordHash" := platform.fn_audit_hash(
    previous_hash,
    NEW."actorOperatorId",
    NEW."action",
    NEW."entityType",
    NEW."entityId",
    NEW."organizationId",
    NEW."before",
    NEW."after",
    NEW."reason",
    NEW."requestId",
    NEW."occurredAt"
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION platform.fn_audit_append() FROM PUBLIC;

DROP TRIGGER IF EXISTS platform_audit_append ON platform.audit_events;
CREATE TRIGGER platform_audit_append
BEFORE INSERT ON platform.audit_events
FOR EACH ROW
EXECUTE FUNCTION platform.fn_audit_append();
