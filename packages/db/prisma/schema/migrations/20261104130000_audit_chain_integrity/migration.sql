-- ==============================================================================
-- Audit chain integrity (findings from #248, D-027)
--
-- 1. An operator with audit history can no longer be deleted. The previous
--    ON DELETE SET NULL rewrote a hashed field in place, so a cleanup silently
--    invalidated every row that operator had signed.
-- 2. The append time is monotonic. Two rows written in the same transaction
--    shared now(), and the tie was broken by a random id, which could link a
--    row to the wrong predecessor.
-- 3. The verifier walks (occurredAt, id); the table only indexed occurredAt,
--    so the walk paid for an external sort.
-- ==============================================================================

SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS "audit_events_occurredAt_id_idx"
  ON platform.audit_events ("occurredAt", "id");

-- ==============================================================================
-- 1. History must outlive its actor
-- ==============================================================================

ALTER TABLE platform.audit_events
  DROP CONSTRAINT "audit_events_actorOperatorId_fkey";

ALTER TABLE platform.audit_events
  ADD CONSTRAINT "audit_events_actorOperatorId_fkey"
  FOREIGN KEY ("actorOperatorId") REFERENCES platform.operators("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ==============================================================================
-- 2. Strictly increasing append time
-- The advisory lock serialises appends, so the latest committed row is stable
-- while the new timestamp is chosen. Owner ACLs survive CREATE OR REPLACE.
-- ==============================================================================

CREATE OR REPLACE FUNCTION platform.fn_audit_append()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE
  previous_hash text;
  latest_occurred_at timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(724001);

  SELECT "recordHash", "occurredAt"
  INTO previous_hash, latest_occurred_at
  FROM platform.audit_events
  ORDER BY "occurredAt" DESC, "id" DESC
  LIMIT 1;

  IF NEW."occurredAt" IS NULL THEN
    NEW."occurredAt" := clock_timestamp();
  END IF;

  IF latest_occurred_at IS NOT NULL
     AND NEW."occurredAt" <= latest_occurred_at THEN
    NEW."occurredAt" := latest_occurred_at + interval '1 microsecond';
  END IF;

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

COMMENT ON CONSTRAINT "audit_events_actorOperatorId_fkey" ON platform.audit_events
  IS 'RESTRICT: deleting an operator would rewrite a hashed audit field and invalidate the chain.';
