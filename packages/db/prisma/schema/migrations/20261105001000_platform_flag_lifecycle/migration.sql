-- P-15 (#224): extend feature flags with lifecycle ownership (OP-8) and grant
-- the Platform identity access to the two flag tables it now manages.
--
-- DDL only: no flag rows are fabricated. Pre-existing rows keep their state;
-- the check is NOT VALID so they remain readable, but any insert or update must
-- supply owner, expiry and removal ticket from now on.

SET lock_timeout = '5s';

ALTER TABLE "system_feature_flags"
  ADD COLUMN "owner" VARCHAR(128),
  ADD COLUMN "expiresAt" TIMESTAMPTZ(6),
  ADD COLUMN "removalTicket" VARCHAR(128);

ALTER TABLE "system_feature_flags"
  ALTER COLUMN "isEnabled" SET DEFAULT false;

CREATE INDEX "system_feature_flags_expiresAt_idx"
  ON "system_feature_flags"("expiresAt");

ALTER TABLE "system_feature_flags"
  ADD CONSTRAINT "system_feature_flags_lifecycle_required"
  CHECK (
    "owner" IS NOT NULL
    AND "expiresAt" IS NOT NULL
    AND "removalTicket" IS NOT NULL
  ) NOT VALID;

-- Least privilege: the Platform identity reads and mutates flags and their
-- domain audit log. It never deletes rows, and the tenant identity keeps no
-- access to control-plane configuration (DB-2).
REVOKE ALL ON TABLE "system_feature_flags" FROM PUBLIC;
REVOKE ALL ON TABLE "system_feature_flag_audit_logs" FROM PUBLIC;
REVOKE ALL ON TABLE "system_feature_flags" FROM app_tenant;
REVOKE ALL ON TABLE "system_feature_flag_audit_logs" FROM app_tenant;

GRANT SELECT, INSERT, UPDATE ON TABLE "system_feature_flags" TO app_platform;
GRANT SELECT, INSERT, UPDATE ON TABLE "system_feature_flag_audit_logs" TO app_platform;

REVOKE DELETE, TRUNCATE ON TABLE "system_feature_flags" FROM app_platform;
REVOKE DELETE, TRUNCATE ON TABLE "system_feature_flag_audit_logs" FROM app_platform;
