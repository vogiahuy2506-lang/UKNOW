-- Migration 122: Tạo bảng email_settings nếu chưa tồn tại
-- Bảng này dùng để lưu cấu hình SMTP cho việc gửi email

CREATE TABLE IF NOT EXISTS email_settings (
  id               BIGSERIAL PRIMARY KEY,
  id_user          BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             VARCHAR(255) NOT NULL,
  email            VARCHAR(255) NOT NULL,
  reply_to         VARCHAR(255),
  smtp_host        VARCHAR(255),
  smtp_port        INTEGER,
  smtp_username    VARCHAR(255),
  smtp_password    TEXT,
  email_mode       TEXT         NOT NULL DEFAULT 'platform',
  platform_prefix  VARCHAR(50)  NOT NULL DEFAULT 'no-reply',
  use_tls          BOOLEAN      NOT NULL DEFAULT TRUE,
  daily_limit      INTEGER      NOT NULL DEFAULT 1000,
  hourly_limit     INTEGER      NOT NULL DEFAULT 100,
  daily_sent_count INTEGER      NOT NULL DEFAULT 0,
  total_sent_count INTEGER      NOT NULL DEFAULT 0,
  is_verified      BOOLEAN      NOT NULL DEFAULT FALSE,
  status           VARCHAR(30)  NOT NULL DEFAULT 'active',
  domain_verification_status VARCHAR(30) NOT NULL DEFAULT 'not_required',
  brand_domain     VARCHAR(255),
  domain_dns_records JSONB,
  domain_verified_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_settings_user ON email_settings(id_user);
CREATE INDEX IF NOT EXISTS idx_email_settings_status ON email_settings(status);
CREATE INDEX IF NOT EXISTS idx_email_settings_brand_domain ON email_settings(brand_domain) WHERE brand_domain IS NOT NULL;

-- Trigger để cập nhật updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_email_settings_updated_at ON email_settings;
CREATE TRIGGER update_email_settings_updated_at
  BEFORE UPDATE ON email_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
