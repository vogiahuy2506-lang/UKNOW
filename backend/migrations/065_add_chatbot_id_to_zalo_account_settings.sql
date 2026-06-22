-- Migration: Add chatbot_id to chatbot_zalo_account_settings
-- Purpose: Link each Zalo Personal account to a specific chatbot

ALTER TABLE chatbot_zalo_account_settings
ADD COLUMN IF NOT EXISTS id_chatbot BIGINT REFERENCES custom_chatbots(id) ON DELETE SET NULL;

-- Index for faster lookups by chatbot
CREATE INDEX IF NOT EXISTS idx_chatbot_zalo_account_chatbot ON chatbot_zalo_account_settings(id_chatbot);

COMMENT ON COLUMN chatbot_zalo_account_settings.id_chatbot IS 'Chatbot được link với tài khoản Zalo này';
