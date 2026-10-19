-- Migration 305: widen chatbot_channel_connections.channel_type CHECK to include 'tiktok_business'.
-- Pattern: copy từ migration 200 (SUPERSET, DROP+ADD ngay trong cùng transaction, không table rewrite).
-- Cho phép mỗi chatbot có NHIỀU tài khoản TikTok Business (giống pattern 'whatsapp_baileys' ở 200), nên
-- KHÔNG dùng UNIQUE(id_chatbot, channel_type) — dùng partial UNIQUE mới: 1 dòng 'tiktok_business' cho
-- legacy fallback (khi chưa có bảng tài khoản riêng), nhưng thực tế sẽ có UNIQUE ở bảng
-- tiktok_business_accounts (created below).
--
-- allow-destructive-ddl: metadata-only SUPERSET CHECK (giá trị mới bao trùm giá trị cũ; existing rows
-- vẫn valid; không table rewrite, không data scan).

ALTER TABLE chatbot_channel_connections
  DROP CONSTRAINT IF EXISTS chatbot_channel_connections_channel_type_check,
  ADD CONSTRAINT chatbot_channel_connections_channel_type_check
    CHECK (channel_type IN ('zalo_oa', 'facebook', 'whatsapp', 'whatsapp_baileys', 'tiktok_business'));


-- Migration 305 (cont.): bảng tài khoản TikTok Business riêng (multi-account per user).
-- Pattern copy từ `telegram_accounts` (`backend/migrations/198_chatbot_telegram_accounts.sql`) và
-- `zalo_accounts`. Mỗi user có thể liên kết nhiều tài khoản TikTok Business (multi-business); bảng
-- này lưu access_token/refresh_token đã mã hoá AES-256-GCM bằng `encryptSmtpSecret`
-- (`backend/src/utils/smtpSecretCrypto.js:51-64`, key SMTP_SECRET_KEY env, prefix `enc:v1:`).

CREATE TABLE IF NOT EXISTS tiktok_business_accounts (
  id BIGSERIAL PRIMARY KEY,
  id_user BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL,                   -- open_id từ TikTok OAuth
  display_name TEXT,                           -- tên hiển thị trong FE
  access_token TEXT NOT NULL,                  -- đã mã hoá bằng encryptSmtpSecret (enc:v1:...)
  refresh_token TEXT NOT NULL,                 -- đã mã hoá
  scope TEXT,                                  -- các scope user đã grant
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_webhook_at TIMESTAMPTZ,
  -- Region + tier (Bẫy 14, 16): từ GET /v2/user/info/ response
  region TEXT,                                 -- 'APAC' | 'LATAM' | 'METAP' | 'NA' (EEA/CH/UK blocked)
  role TEXT,                                   -- 'business_account' (Verified / Advanced / General) | 'personal_account'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tiktok_business_accounts_user_business UNIQUE (id_user, business_id)
);

CREATE INDEX IF NOT EXISTS idx_tiktok_business_accounts_user_active
  ON tiktok_business_accounts (id_user, is_active);
CREATE INDEX IF NOT EXISTS idx_tiktok_business_accounts_expiring
  ON tiktok_business_accounts (access_token_expires_at)
  WHERE is_active = true;
