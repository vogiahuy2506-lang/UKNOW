-- Migration 195: Per-user WhatsApp Cloud API app credentials.
--
-- Purpose:
--   Allow each user to connect their OWN Meta App (instead of sharing one
--   app from the backend .env). Without this, every customer would need to
--   hand their App Secret to the platform owner to paste into server-side
--   env vars — which is operationally impossible and a security red flag.
--
--   One row per (user, app_id). The `app_secret` is AES-256-GCM encrypted
--   using SMTP_SECRET_KEY (reusing the existing key, same cipher, prefix
--   `enc:v1:`) so we never persist plaintext secrets.
--
--   A user may have multiple Meta Apps over time (e.g. dev/staging vs prod);
--   but at most one row should be marked `is_default = true`. We enforce
--   that with a partial UNIQUE index.

CREATE TABLE IF NOT EXISTS user_whatsapp_app_credentials (
  id                   BIGSERIAL PRIMARY KEY,
  id_user              BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id               VARCHAR(64) NOT NULL,
  app_secret_encrypted TEXT NOT NULL,                 -- encrypted with SMTP_SECRET_KEY (AES-256-GCM)
  app_name             VARCHAR(255),                  -- Friendly label ("My Shop Dev")
  webhook_verify_token VARCHAR(128),                  -- Optional per-app verify token (otherwise uses env default)
  is_default           BOOLEAN NOT NULL DEFAULT false,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  last_used_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_whatsapp_app
  ON user_whatsapp_app_credentials(id_user, app_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_whatsapp_default
  ON user_whatsapp_app_credentials(id_user)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_user_whatsapp_app_active
  ON user_whatsapp_app_credentials(id_user, is_active)
  WHERE is_active = true;

COMMENT ON TABLE user_whatsapp_app_credentials IS
  'Per-user Meta App credentials for WhatsApp Cloud API. app_secret is AES-256-GCM encrypted with SMTP_SECRET_KEY.';
COMMENT ON COLUMN user_whatsapp_app_credentials.app_secret_encrypted IS
  'AES-256-GCM ciphertext, prefix enc:v1:. Decrypt with decryptSmtpSecret() before passing to Meta Graph API.';
COMMENT ON COLUMN user_whatsapp_app_credentials.is_default IS
  'At most one default row per user (enforced by partial UNIQUE). OAuth flow picks this row when no explicit app_id is supplied.';
COMMENT ON COLUMN user_whatsapp_app_credentials.webhook_verify_token IS
  'Optional override; when null, falls back to WHATSAPP_WEBHOOK_VERIFY_TOKEN env var.';
