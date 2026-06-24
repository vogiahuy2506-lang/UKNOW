-- Migration 071: Gói dịch vụ — model Gemini cao nhất được phép dùng
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS ai_model VARCHAR(64) DEFAULT 'gemini-2.5-flash';

COMMENT ON COLUMN plans.ai_model IS 'Model Gemini cao nhất user gói này được dùng (clamp-theo-tier).';

UPDATE plans
SET ai_model = CASE LOWER(code)
  WHEN 'trial' THEN 'gemini-2.0-flash'
  WHEN 'starter' THEN 'gemini-2.0-flash'
  WHEN 'basic' THEN 'gemini-2.5-flash'
  WHEN 'professional' THEN 'gemini-2.5-flash'
  WHEN 'enterprise' THEN 'gemini-2.5-pro'
  ELSE COALESCE(ai_model, 'gemini-2.5-flash')
END
WHERE is_custom = FALSE;
