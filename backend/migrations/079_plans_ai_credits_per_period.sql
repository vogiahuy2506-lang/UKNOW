-- Re-introduce AI credits per billing period (user-facing quota).
-- NULL or 0 = unlimited (same convention as ai_tokens_per_period).

BEGIN;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS ai_credits_per_period INTEGER;

ALTER TABLE plans
  DROP CONSTRAINT IF EXISTS plans_ai_credits_per_period_check,
  ADD CONSTRAINT plans_ai_credits_per_period_check
    CHECK (ai_credits_per_period IS NULL OR ai_credits_per_period >= 0);

COMMENT ON COLUMN plans.ai_credits_per_period IS 'AI credits per billing cycle. One user AI action = 1 credit. NULL/0 = unlimited.';

UPDATE plans SET ai_credits_per_period = 50   WHERE LOWER(code) = 'trial' AND (ai_credits_per_period IS NULL);
UPDATE plans SET ai_credits_per_period = 500  WHERE LOWER(code) = 'starter' AND (ai_credits_per_period IS NULL);
UPDATE plans SET ai_credits_per_period = 3000 WHERE LOWER(code) = 'basic' AND (ai_credits_per_period IS NULL);
UPDATE plans SET ai_credits_per_period = NULL WHERE LOWER(code) IN ('professional', 'enterprise');

COMMIT;
