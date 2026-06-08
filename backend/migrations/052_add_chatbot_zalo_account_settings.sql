-- Migration: Add chatbot_zalo_account_settings table
-- Purpose: Store chatbot settings for each Zalo personal account
-- Allows users to enable/disable chatbot auto-reply for specific Zalo accounts

CREATE TABLE IF NOT EXISTS chatbot_zalo_account_settings (
    id                  BIGSERIAL PRIMARY KEY,
    id_user             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id_zalo_setting     BIGINT NOT NULL REFERENCES zalo_settings(id) ON DELETE CASCADE,
    is_enabled          BOOLEAN DEFAULT false,
    id_sub_assistant    BIGINT REFERENCES sub_assistants(id) ON DELETE SET NULL,
    welcome_message     TEXT,
    ai_model            VARCHAR(50) DEFAULT 'gemini-2.5-flash',
    temperature         DECIMAL(3,2) DEFAULT 0.7,
    max_tokens          INTEGER DEFAULT 2048,
    response_style      VARCHAR(20) DEFAULT 'friendly',
    system_instruction  TEXT,
    settings            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_chatbot_zalo_account UNIQUE (id_user, id_zalo_setting)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_chatbot_zalo_account_user ON chatbot_zalo_account_settings(id_user);
CREATE INDEX IF NOT EXISTS idx_chatbot_zalo_account_setting ON chatbot_zalo_account_settings(id_zalo_setting);

COMMENT ON TABLE chatbot_zalo_account_settings IS 'Lưu cấu hình chatbot cho từng tài khoản Zalo cá nhân';
COMMENT ON COLUMN chatbot_zalo_account_settings.is_enabled IS 'Bật/tắt chatbot trả lời tự động cho tài khoản này';
