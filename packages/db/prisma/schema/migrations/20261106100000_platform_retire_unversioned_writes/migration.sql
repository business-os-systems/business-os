-- ==============================================================================
-- Retire the unversioned entitlement/settings writes (#229)
--
-- fn_set_entitlement and fn_set_app_setting predate the versioned functions.
-- They remain owner-executable for forensics and the P-05 function suite, but
-- the platform runtime must never reach a write path that skips the
-- optimistic-concurrency guard (CT-3 / FR-114).
-- ==============================================================================

SET lock_timeout = '5s';

REVOKE EXECUTE ON FUNCTION platform.fn_set_entitlement(text, text, boolean, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION platform.fn_set_entitlement(text, text, boolean, text, text) FROM app_tenant;
REVOKE EXECUTE ON FUNCTION platform.fn_set_entitlement(text, text, boolean, text, text) FROM app_platform;

REVOKE EXECUTE ON FUNCTION platform.fn_set_app_setting(text, text, jsonb, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION platform.fn_set_app_setting(text, text, jsonb, text, text) FROM app_tenant;
REVOKE EXECUTE ON FUNCTION platform.fn_set_app_setting(text, text, jsonb, text, text) FROM app_platform;

COMMENT ON FUNCTION platform.fn_set_entitlement(text, text, boolean, text, text)
  IS 'Superseded by fn_set_entitlement_versioned; owner-only since #229.';
COMMENT ON FUNCTION platform.fn_set_app_setting(text, text, jsonb, text, text)
  IS 'Superseded by fn_set_app_setting_versioned; owner-only since #229.';
