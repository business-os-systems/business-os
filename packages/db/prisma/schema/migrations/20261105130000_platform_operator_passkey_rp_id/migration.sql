-- P-18 (#227): bind every operator passkey to the WebAuthn relying-party ID
-- it was enrolled under. When the control plane moves domains the configured
-- RP ID changes and the old credential must be refused with an explicit
-- re-enrolment outcome. Nullable so passkeys enrolled before this release stay
-- readable; a successful sign-in under the current identity stamps the row.
--
-- DDL only: no rows are rewritten and the existing table grants are unchanged.

SET lock_timeout = '5s';

ALTER TABLE "platform"."operator_passkeys"
  ADD COLUMN "rpId" VARCHAR(253);

COMMENT ON COLUMN "platform"."operator_passkeys"."rpId"
  IS 'WebAuthn relying-party ID recorded at enrolment; a mismatch requires re-enrolment';
