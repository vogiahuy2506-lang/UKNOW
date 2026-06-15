-- Rename AI quota from request credits to real Gemini tokens per period.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plans' AND column_name = 'ai_credits_per_period'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plans' AND column_name = 'ai_tokens_per_period'
  ) THEN
    ALTER TABLE plans RENAME COLUMN ai_credits_per_period TO ai_tokens_per_period;
  END IF;
END $$;

ALTER TABLE plans
  DROP CONSTRAINT IF EXISTS plans_ai_credits_per_period_check,
  DROP CONSTRAINT IF EXISTS plans_ai_tokens_per_period_check,
  ADD CONSTRAINT plans_ai_tokens_per_period_check
    CHECK (ai_tokens_per_period IS NULL OR ai_tokens_per_period >= 0);

COMMENT ON COLUMN plans.ai_tokens_per_period IS
  'AI tokens available per usage period. NULL/0 = unlimited.';

UPDATE plans
SET ai_tokens_per_period = CASE
  WHEN LOWER(code) = 'trial' THEN 50000
  WHEN LOWER(code) IN ('starter') THEN 500000
  WHEN LOWER(code) IN ('basic') THEN 3000000
  WHEN LOWER(code) IN ('pro', 'professional', 'team', 'business', 'enterprise') THEN NULL
  -- Unknown/custom plans should not inherit the old credit-sized numbers as token quota.
  ELSE NULL
END;
