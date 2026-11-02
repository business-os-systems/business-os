SET lock_timeout = '5s';

ALTER FUNCTION platform.fn_audit_append()
  SET search_path = pg_catalog, platform;
