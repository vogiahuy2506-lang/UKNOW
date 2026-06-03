-- Migration 040: Audit logs table
-- Tracks system-level events (super admin view) and workspace-level events (employer view)

CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  id_user     INT REFERENCES users(id) ON DELETE SET NULL,
  owner_id    INT REFERENCES users(id) ON DELETE SET NULL,  -- employer owning the workspace
  category    VARCHAR(20) NOT NULL DEFAULT 'workspace',    -- 'system' | 'workspace'
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id   INT,
  details     JSONB DEFAULT '{}',
  ip_address  VARCHAR(45),
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_id_user    ON audit_logs(id_user);
CREATE INDEX IF NOT EXISTS idx_audit_logs_owner_id   ON audit_logs(owner_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category   ON audit_logs(category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON audit_logs(action);
