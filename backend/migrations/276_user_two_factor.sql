-- Migration 276: bang user_two_factor — TOTP (RFC 6238) + ma khoi phuc, 1 dong / user.
-- secret_enc: AES-256-GCM qua smtpSecretCrypto (prefix enc:v1:), KHONG bao gio luu plaintext.
-- recovery_codes: JSONB mang sha256-hex cua ma khoi phuc chua dung (dung xong thi rut khoi mang).
-- enabled_at NULL = dang cai dat (pending), chua co hieu luc khi dang nhap.
CREATE TABLE IF NOT EXISTS user_two_factor (
  user_id          BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_enc       TEXT        NOT NULL,
  enabled_at       TIMESTAMPTZ,
  recovery_codes   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  last_used_step   BIGINT,
  failed_attempts  INTEGER     NOT NULL DEFAULT 0,
  locked_until     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
