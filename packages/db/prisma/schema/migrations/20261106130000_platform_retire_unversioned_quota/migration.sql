-- ==============================================================================
-- Retire the unversioned quota write (#230)
--
-- fn_set_quota predates the versioned quota contract. The API now uses
-- fn_set_quota_versioned. The platform runtime must not be able to bypass the
-- optimistic-concurrency guard or the audit row (CT-3, FR-114), either by
-- calling the old function or by updating the table directly.
-- ==============================================================================

SET lock_timeout = '5s';

REVOKE EXECUTE ON FUNCTION platform.fn_set_quota(text, text, bigint, boolean, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION platform.fn_set_quota(text, text, bigint, boolean, text, text) FROM app_tenant;
REVOKE EXECUTE ON FUNCTION platform.fn_set_quota(text, text, bigint, boolean, text, text) FROM app_platform;

REVOKE INSERT, UPDATE ON TABLE platform.quotas FROM app_platform;

COMMENT ON FUNCTION platform.fn_set_quota(text, text, bigint, boolean, text, text)
  IS 'Superseded by fn_set_quota_versioned; owner-only since #230.';
