-- Migration 195: WhatsApp Baileys session settings
--
-- Purpose:
--   Cho phép các WhatsApp session kết nối qua Baileys (QR scan — không cần
--   Meta App / Business verification) được dùng làm channel cho chatbot,
--   song song với WhatsApp Cloud API hiện có (bảng
--   chatbot_whatsapp_account_settings, tham chiếu
--   chatbot_channel_connections).
--
--   Bảng mới `chatbot_whatsapp_baileys_settings`:
--     - id_user           : owner
--     - session_key       : shortKey mà user tự đặt (vd "default", "shop-a")
--     - id_chatbot        : chatbot được bật AI cho session này (nullable = global)
--     - is_enabled        : AI toggle
--     - Các field override AI: welcome_message, ai_model, temperature,
--       max_tokens, response_style, system_instruction, settings JSONB.
--
--   Lưu ý: KHÔNG tham chiếu chatbot_channel_connections vì Baileys session
--   là in-memory + persisted file trong whatsapp-sessions/, không có row
--   trong DB. Lookup runtime sẽ qua whatsappBaileys.service.

BEGIN;

CREATE TABLE IF NOT EXISTS chatbot_whatsapp_baileys_settings (
  id                    BIGSERIAL PRIMARY KEY,
  id_user               BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_key           VARCHAR(128) NOT NULL,
  id_chatbot            BIGINT REFERENCES custom_chatbots(id) ON DELETE CASCADE,
  is_enabled            BOOLEAN NOT NULL DEFAULT false,
  id_sub_assistant      BIGINT REFERENCES sub_assistants(id) ON DELETE SET NULL,
  welcome_message       TEXT,
  ai_model              VARCHAR(50) DEFAULT 'gemini-2.5-flash',
  temperature           DECIMAL(3,2) DEFAULT 0.7,
  max_tokens            INTEGER DEFAULT 2048,
  response_style        VARCHAR(20) DEFAULT 'friendly',
  system_instruction    TEXT,
  settings              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_chatbot_whatsapp_baileys_user_session_chatbot
    UNIQUE (id_user, session_key, id_chatbot)
);

COMMENT ON TABLE chatbot_whatsapp_baileys_settings
  IS 'Per-(user, WhatsApp Baileys session, chatbot) AI enable flag and optional overrides. Independent from chatbot_whatsapp_account_settings (Cloud API).';
COMMENT ON CONSTRAINT uq_chatbot_whatsapp_baileys_user_session_chatbot ON chatbot_whatsapp_baileys_settings
  IS 'Each (user, WhatsApp Baileys session, chatbot) tuple is independent.';

CREATE INDEX IF NOT EXISTS idx_chatbot_whatsapp_baileys_user
  ON chatbot_whatsapp_baileys_settings(id_user);
CREATE INDEX IF NOT EXISTS idx_chatbot_whatsapp_baileys_session
  ON chatbot_whatsapp_baileys_settings(session_key);
CREATE INDEX IF NOT EXISTS idx_chatbot_whatsapp_baileys_chatbot
  ON chatbot_whatsapp_baileys_settings(id_chatbot)
  WHERE id_chatbot IS NOT NULL;

COMMIT;
