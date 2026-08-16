-- Migration 139: Add auth_provider to users table with backfill from login_history
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(16) NOT NULL DEFAULT 'local'
  CHECK (auth_provider IN ('local', 'google'));

UPDATE users u SET auth_provider = 'google'
WHERE EXISTS (SELECT 1 FROM login_history h
              WHERE h.id_user = u.id AND h.login_status = 'success' AND h.failure_reason = 'google')
  AND NOT EXISTS (SELECT 1 FROM login_history h2
                  WHERE h2.id_user = u.id AND h2.login_status = 'success'
                    AND (h2.failure_reason IS NULL OR h2.failure_reason <> 'google'));

COMMIT;
