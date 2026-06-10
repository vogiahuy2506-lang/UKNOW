-- Chatbot and AI credit limits per plan.
-- NULL or 0 = unlimited/backward-compatible for existing plans.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS max_chatbots INTEGER,
  ADD COLUMN IF NOT EXISTS ai_credits_per_period INTEGER;

COMMENT ON COLUMN plans.max_chatbots IS 'Maximum active custom chatbots allowed for this plan. NULL/0 = unlimited.';
COMMENT ON COLUMN plans.ai_credits_per_period IS 'AI credits available per billing period. One AI request currently consumes one credit. NULL/0 = unlimited.';

ALTER TABLE plans
  DROP CONSTRAINT IF EXISTS plans_max_chatbots_check,
  ADD CONSTRAINT plans_max_chatbots_check
    CHECK (max_chatbots IS NULL OR max_chatbots >= 0);

ALTER TABLE plans
  DROP CONSTRAINT IF EXISTS plans_ai_credits_per_period_check,
  ADD CONSTRAINT plans_ai_credits_per_period_check
    CHECK (ai_credits_per_period IS NULL OR ai_credits_per_period >= 0);
