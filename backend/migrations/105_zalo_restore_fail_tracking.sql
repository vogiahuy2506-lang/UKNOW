-- Stop auto-restore hammering dead Zalo cookies; track continuous failure window.
ALTER TABLE zalo_settings
  ADD COLUMN IF NOT EXISTS restore_fail_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_restore_fail_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_restore_attempt_at TIMESTAMPTZ;
