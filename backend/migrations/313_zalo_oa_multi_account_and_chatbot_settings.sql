-- Migration 313: Zalo OA Multi-Account and Per-Chatbot Settings
-- Hỗ trợ liên kết nhiều Zalo OA cấp Workspace và bật/tắt riêng cho từng Chatbot.
-- Hỗ trợ lưu mã xác thực tên miền Zalo (Domain Verification) phục vụ file HTML động.

-- 1. Bảng lưu mã xác thực tên miền (Zalo, Facebook, Google...)
CREATE TABLE IF NOT EXISTS system_domain_verifications (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(32) NOT NULL DEFAULT 'zalo',
    domain VARCHAR(255) NOT NULL,
    verification_code TEXT NOT NULL,
    file_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (platform, domain)
);

-- 2. Mở rộng channel_connections hỗ trợ nhiều Zalo OA cho mỗi user/workspace
ALTER TABLE channel_connections
  ADD COLUMN IF NOT EXISTS zalo_oa_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS zalo_oa_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS zalo_oa_avatar TEXT;

-- Unique per (id_user, channel, zalo_oa_id) cho zalo_oa
CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_user_zalo_oa
  ON channel_connections (id_user, channel, zalo_oa_id)
  WHERE channel = 'zalo_oa';

CREATE INDEX IF NOT EXISTS idx_channel_conn_zalo_oa_id
  ON channel_connections (zalo_oa_id)
  WHERE zalo_oa_id IS NOT NULL;

-- 3. Nới lỏng partial unique constraint của chatbot_channel_connections
-- Thay thế legacy single-row uq_chatbot_channel_legacy (trước đây gom chung zalo_oa và facebook)
DROP INDEX IF EXISTS uq_chatbot_channel_legacy;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chatbot_channel_legacy_facebook
  ON chatbot_channel_connections(id_chatbot, channel_type)
  WHERE channel_type = 'facebook';

CREATE UNIQUE INDEX IF NOT EXISTS uq_chatbot_channel_zalo_oa
  ON chatbot_channel_connections(id_chatbot, channel_type, external_channel_id)
  WHERE channel_type = 'zalo_oa';

-- 4. Bảng liên kết bật/tắt Zalo OA cho từng Chatbot (mirrors chatbot_whatsapp_account_settings)
CREATE TABLE IF NOT EXISTS chatbot_zalo_oa_settings (
    id SERIAL PRIMARY KEY,
    id_chatbot INTEGER NOT NULL REFERENCES custom_chatbots(id) ON DELETE CASCADE,
    id_channel_connection INTEGER NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
    id_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (id_chatbot, id_channel_connection)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_zalo_oa_active
  ON chatbot_zalo_oa_settings (id_channel_connection, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_chatbot_zalo_oa_chatbot
  ON chatbot_zalo_oa_settings (id_chatbot);

COMMENT ON TABLE system_domain_verifications IS 'Lưu trữ mã xác thực tên miền cho Zalo / Facebook site verification';
COMMENT ON TABLE chatbot_zalo_oa_settings IS 'Cấu hình bật/tắt và cài đặt riêng của từng Zalo OA đối với mỗi chatbot';

