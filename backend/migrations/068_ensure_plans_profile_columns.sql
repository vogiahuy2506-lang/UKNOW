-- Idempotent safety net: ensure columns used by GET /api/users/profile plan query exist.
-- Prod may have skipped migration 064 (ai_tokens_per_period rename).

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS daily_email_limit   INTEGER,
  ADD COLUMN IF NOT EXISTS monthly_email_limit INTEGER,
  ADD COLUMN IF NOT EXISTS daily_zalo_limit    INTEGER,
  ADD COLUMN IF NOT EXISTS monthly_zalo_limit  INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plans' AND column_name = 'ai_tokens_per_period'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'plans' AND column_name = 'ai_credits_per_period'
    ) THEN
      ALTER TABLE plans RENAME COLUMN ai_credits_per_period TO ai_tokens_per_period;
    ELSE
      ALTER TABLE plans ADD COLUMN ai_tokens_per_period INTEGER;
    END IF;
  END IF;
END $$;

ALTER TABLE plans
  DROP CONSTRAINT IF EXISTS plans_ai_credits_per_period_check,
  DROP CONSTRAINT IF EXISTS plans_ai_tokens_per_period_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'plans_ai_tokens_per_period_check'
  ) THEN
    ALTER TABLE plans
      ADD CONSTRAINT plans_ai_tokens_per_period_check
        CHECK (ai_tokens_per_period IS NULL OR ai_tokens_per_period >= 0);
  END IF;
END $$;

COMMENT ON COLUMN plans.ai_tokens_per_period IS
  'AI tokens available per usage period. NULL/0 = unlimited.';
