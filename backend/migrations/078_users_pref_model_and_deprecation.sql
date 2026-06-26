-- User preferred AI Assistant model + cleanup deprecated Gemini defaults.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_ai_model TEXT;

UPDATE plans
SET ai_model = 'gemini-2.5-flash'
WHERE ai_model IN ('gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chatbot_settings' AND column_name = 'ai_model'
  ) THEN
    UPDATE chatbot_settings
    SET ai_model = 'gemini-2.5-flash'
    WHERE ai_model IN ('gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_chatbots' AND column_name = 'ai_model'
  ) THEN
    UPDATE custom_chatbots
    SET ai_model = 'gemini-2.5-flash'
    WHERE ai_model IN ('gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chatbot_zalo_account_settings' AND column_name = 'ai_model'
  ) THEN
    UPDATE chatbot_zalo_account_settings
    SET ai_model = 'gemini-2.5-flash'
    WHERE ai_model IN ('gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite');
  END IF;
END $$;

COMMENT ON COLUMN users.preferred_ai_model IS 'Model AI Assistant user chọn gần nhất; policy vẫn clamp theo plan và catalog enabled.';
