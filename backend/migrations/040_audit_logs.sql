-- Migration 040: Audit logs table
-- Tracks system-level events (super admin view) and workspace-level events (employer view)

CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  id_user     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  owner_id    BIGINT REFERENCES users(id) ON DELETE SET NULL, -- employer owning the workspace
  category    VARCHAR(20) NOT NULL DEFAULT 'workspace',    -- 'system' | 'workspace'
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id   BIGINT,
  details     JSONB DEFAULT '{}',
  ip_address  VARCHAR(45),
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- audit_logs may already exist from 032_unified_inbox.sql. CREATE TABLE IF NOT EXISTS
-- does not add new columns, so keep this migration additive for production DBs.
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS id_user BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category VARCHAR(20) NOT NULL DEFAULT 'workspace',
  ADD COLUMN IF NOT EXISTS action VARCHAR(100),
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS entity_id BIGINT,
  ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45),
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

UPDATE audit_logs
SET category = 'workspace'
WHERE category IS NULL;

UPDATE audit_logs
SET details = '{}'
WHERE details IS NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_id_user    ON audit_logs(id_user);
CREATE INDEX IF NOT EXISTS idx_audit_logs_owner_id   ON audit_logs(owner_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category   ON audit_logs(category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON audit_logs(action);
