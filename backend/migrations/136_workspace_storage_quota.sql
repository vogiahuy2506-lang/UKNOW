-- Migration 136: workspace file-storage quota (PR-1)
-- Ledger writes are always enabled; only quota blocking is feature-flagged.

BEGIN;

ALTER TABLE plans ADD COLUMN IF NOT EXISTS storage_limit_bytes BIGINT;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_kb_documents INTEGER;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_kb_extracted_chars BIGINT;

UPDATE plans
SET storage_limit_bytes = CASE LOWER(COALESCE(code, ''))
  WHEN 'trial' THEN 104857600
  WHEN 'starter' THEN 524288000
  WHEN 'basic' THEN 1073741824
  WHEN 'professional' THEN 2147483648
  WHEN 'enterprise' THEN 3221225472
  ELSE 104857600
END
WHERE storage_limit_bytes IS NULL;

ALTER TABLE plans ALTER COLUMN storage_limit_bytes SET NOT NULL;
ALTER TABLE plans
  ADD CONSTRAINT plans_storage_limit_bytes_positive CHECK (storage_limit_bytes > 0);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS storage_quota_override_bytes BIGINT;
ALTER TABLE users
  ADD CONSTRAINT users_storage_quota_override_bytes_positive
  CHECK (storage_quota_override_bytes IS NULL OR storage_quota_override_bytes > 0);

CREATE TABLE IF NOT EXISTS storage_objects (
  id BIGSERIAL PRIMARY KEY,
  pool_type VARCHAR(16) NOT NULL DEFAULT 'workspace'
    CHECK (pool_type IN ('workspace', 'system')),
  owner_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  storage_key TEXT UNIQUE,
  temp_key TEXT UNIQUE,
  category VARCHAR(32) NOT NULL,
  state VARCHAR(24) NOT NULL
    CHECK (state IN ('active', 'temp', 'cleanup_pending', 'orphaned', 'deleted')),
  size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  expires_at TIMESTAMPTZ,
  reference_type VARCHAR(40),
  reference_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT storage_objects_pool_owner_check CHECK (
    (pool_type = 'workspace' AND owner_user_id IS NOT NULL)
    OR (pool_type = 'system' AND owner_user_id IS NULL)
  ),
  CONSTRAINT storage_objects_live_key_check CHECK (
    state NOT IN ('active', 'temp', 'cleanup_pending')
    OR storage_key IS NOT NULL
    OR temp_key IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_storage_objects_owner_usage
  ON storage_objects (owner_user_id, pool_type, state)
  WHERE state IN ('active', 'temp', 'cleanup_pending');
CREATE INDEX IF NOT EXISTS idx_storage_objects_expiry
  ON storage_objects (expires_at)
  WHERE state = 'temp' AND expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_storage_objects_storage_key ON storage_objects (storage_key);

ALTER TABLE chat_attachments
  ADD COLUMN IF NOT EXISTS storage_object_id BIGINT REFERENCES storage_objects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_chat_attachments_storage_object
  ON chat_attachments (storage_object_id)
  WHERE storage_object_id IS NOT NULL;

COMMIT;
