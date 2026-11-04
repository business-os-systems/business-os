-- ==============================================================================
-- One-time audit chain re-seal (D-027). Owner/migration identity only.
--
-- WHY: before the RESTRICT constraint, deleting an operator set
-- audit_events.actorOperatorId to NULL, which changed a hashed field. Those
-- rows can never be verified again because the original actor is unknown, and
-- two rows could share an occurredAt so their order was ambiguous.
--
-- WHAT: recomputes prevHash and recordHash for every existing row in
-- (occurredAt, id) order, then appends one AUDIT_CHAIN_RESEALED row so the
-- repair itself is visible in the trail. Row ids, actions, actors and
-- timestamps are never changed.
--
-- WHEN: run once, with written approval, after deploying
-- 20261104130000_audit_chain_integrity. The script refuses a second run: a
-- further repair is a new decision, not a repeat of this one.
--
-- HOW: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/platform/reseal-audit-chain.sql
-- ==============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $$
DECLARE
  current_row record;
  expected_prev text := NULL;
  computed text;
  broken_rows integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(724001);

  IF EXISTS (
    SELECT 1 FROM platform.audit_events
    WHERE "action" = 'AUDIT_CHAIN_RESEALED'
  ) THEN
    RAISE EXCEPTION
      'Audit chain was already re-sealed; a further repair needs a new approved procedure';
  END IF;

  -- Both failure modes count: a rewritten field (hash mismatch) and a deleted
  -- or reordered row (link mismatch). Checking hashes alone would report a
  -- chain with a missing middle row as healthy.
  WITH ordered AS (
    SELECT
      a."prevHash",
      a."recordHash",
      lag(a."recordHash") OVER (ORDER BY a."occurredAt", a."id") AS expected_prev,
      platform.fn_audit_hash(
        a."prevHash",
        a."actorOperatorId",
        a."action",
        a."entityType",
        a."entityId",
        a."organizationId",
        a."before",
        a."after",
        a."reason",
        a."requestId",
        a."occurredAt"
      ) AS computed
    FROM platform.audit_events a
  )
  SELECT count(*) INTO broken_rows
  FROM ordered
  WHERE "prevHash" IS DISTINCT FROM expected_prev
     OR computed IS DISTINCT FROM "recordHash";

  IF broken_rows = 0 THEN
    RAISE NOTICE 'Audit chain already verifies; nothing to re-seal.';
    RETURN;
  END IF;

  FOR current_row IN
    SELECT a.*
    FROM platform.audit_events a
    ORDER BY a."occurredAt" ASC, a."id" ASC
  LOOP
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

    IF current_row."prevHash" IS DISTINCT FROM expected_prev
       OR current_row."recordHash" IS DISTINCT FROM computed THEN
      UPDATE platform.audit_events
      SET "prevHash" = expected_prev,
          "recordHash" = computed
      WHERE "id" = current_row."id";
    END IF;

    expected_prev := computed;
  END LOOP;

  INSERT INTO platform.audit_events (
    "id", "actorOperatorId", "action", "entityType", "entityId",
    "requestId", "reason", "recordHash", "occurredAt"
  ) VALUES (
    gen_random_uuid()::text,
    NULL,
    'AUDIT_CHAIN_RESEALED',
    'platform.audit_events',
    'global',
    'maintenance:audit-reseal',
    left('One-time re-seal after operator deletion nulled actor ids (D-027); session ' || session_user, 255),
    'PENDING',
    clock_timestamp()
  );

  RAISE NOTICE 'Re-sealed % broken rows and appended the reseal record.', broken_rows;
END $$;
