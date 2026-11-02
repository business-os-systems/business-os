SET lock_timeout = '5s';

ALTER TABLE platform.audit_events
  ADD CONSTRAINT audit_events_record_hash_not_pending
  CHECK ("recordHash" <> 'PENDING');
