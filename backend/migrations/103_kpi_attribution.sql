-- Migration 103: KPI attribution columns + prep for funnel/contribution metrics
-- Phần 0 of PLAN_DO_LUONG_KPI — stop losing actor data.

BEGIN;

-- 0a. Who clicked "Run" (NULL for scheduled runs)
ALTER TABLE campaign_runs
  ADD COLUMN IF NOT EXISTS triggered_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_runs_triggered_by
  ON campaign_runs (triggered_by)
  WHERE triggered_by IS NOT NULL;

-- 0b. Who invoked AI (id_user stays billing/workspace owner for quota)
ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_usage_logs_actor
  ON usage_logs (actor_user_id)
  WHERE actor_user_id IS NOT NULL;

-- Backfill actor from existing credit metadata when present
UPDATE usage_logs
SET actor_user_id = NULLIF(metadata->>'actorUserId', '')::bigint
WHERE actor_user_id IS NULL
  AND metadata ? 'actorUserId'
  AND (metadata->>'actorUserId') ~ '^[0-9]+$';

COMMIT;
