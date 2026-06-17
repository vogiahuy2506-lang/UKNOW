-- Diagnostic tool: production-fidelity mode + per-stage timing columns
ALTER TABLE diagnostic_runs
  ADD COLUMN IF NOT EXISTS mode VARCHAR(20) NOT NULL DEFAULT 'fast',
  ADD COLUMN IF NOT EXISTS policy_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS skipped_count INT NOT NULL DEFAULT 0;

ALTER TABLE diagnostic_messages
  ADD COLUMN IF NOT EXISTS wait_ms INT,
  ADD COLUMN IF NOT EXISTS wait_reason VARCHAR(40),
  ADD COLUMN IF NOT EXISTS lookup_ms INT,
  ADD COLUMN IF NOT EXISTS send_ms INT,
  ADD COLUMN IF NOT EXISTS attempts INT,
  ADD COLUMN IF NOT EXISTS error_category VARCHAR(60),
  ADD COLUMN IF NOT EXISTS resolved_uid VARCHAR(64),
  ADD COLUMN IF NOT EXISTS zalo_name VARCHAR(255);
