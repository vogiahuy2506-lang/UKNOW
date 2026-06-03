-- Migration 040: Audit logs table
-- Tracks system-level events (super admin view) and workspace-level events (employer view)

CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  id_user     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  owner_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  category    VARCHAR(20) NOT NULL DEFAULT 'workspace',
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id   BIGINT,
  details     JSONB DEFAULT '{}',
  ip_address  VARCHAR(45),
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Table may already exist from 032_unified_inbox.sql with a different schema.
-- Add the two missing columns individually — separate statements avoid multi-column rollback.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS owner_id BIGINT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS category VARCHAR(20) DEFAULT 'workspace';

-- Back-fill so no NULLs remain before enforcing NOT NULL
UPDATE audit_logs SET category = 'workspace' WHERE category IS NULL;
UPDATE audit_logs SET details = '{}'         WHERE details IS NULL;

-- Enforce NOT NULL on category (idempotent if already set)
ALTER TABLE audit_logs ALTER COLUMN category SET NOT NULL;

-- Add FK on owner_id only if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.referential_constraints rc
    JOIN   information_schema.key_column_usage kcu
           ON kcu.constraint_name = rc.constraint_name
    WHERE  kcu.table_name  = 'audit_logs'
      AND  kcu.column_name = 'owner_id'
  ) THEN
    ALTER TABLE audit_logs
      ADD CONSTRAINT audit_logs_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_id_user    ON audit_logs(id_user);
CREATE INDEX IF NOT EXISTS idx_audit_logs_owner_id   ON audit_logs(owner_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category   ON audit_logs(category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON audit_logs(action);
