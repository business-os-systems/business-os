-- T182 (#316): bind every control session to the WebAuthn relying-party ID it
-- was issued under. A session whose stored rpId differs from the configured
-- CONTROL_WEBAUTHN_RP_ID (including a legacy NULL row) is revoked on first use,
-- so a domain move cannot leave an old session alive.
--
-- DDL only: no rows are rewritten and the existing table grants are unchanged.

SET lock_timeout = '5s';

ALTER TABLE "platform"."operator_sessions"
  ADD COLUMN "rpId" VARCHAR(253);

COMMENT ON COLUMN "platform"."operator_sessions"."rpId"
  IS 'WebAuthn relying-party ID recorded at session issuance; a mismatch revokes the session';
