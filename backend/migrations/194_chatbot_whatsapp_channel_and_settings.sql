-- Migration 194: Add WhatsApp Cloud API channel to chatbot_channel_connections
-- and create chatbot_whatsapp_account_settings for per-chatbot AI enable.
--
-- Purpose:
--   1. Extend the existing channel_type CHECK constraint to include 'whatsapp'.
--   2. Relax the UNIQUE(id_chatbot, channel_type) into two partial UNIQUE
--      constraints so multiple WhatsApp accounts can coexist on one chatbot
--      while legacy Zalo OA / Facebook channels stay single-row.
--   3. Add columns used by the WhatsApp Cloud API (phone_number, waba_id,
--      phone_number_id, business_id, app_id) plus a lookup index.
--   4. Create chatbot_whatsapp_account_settings mirroring the pattern of
--      chatbot_zalo_account_settings (migration 160) so each
--      (user, whatsapp_account, chatbot) tuple can be toggled independently.

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Part A — chatbot_channel_connections (extend)                       ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- 1. Drop the old single-row UNIQUE on (id_chatbot, channel_type). We will
--    replace it with two partial UNIQUE constraints below.
ALTER TABLE chatbot_channel_connections
  DROP CONSTRAINT IF EXISTS chatbot_channel_connections_id_chatbot_channel_type_key;

-- Detect the CHECK constraint name dynamically because some installs use the
-- auto-generated "<table>_<column>_check" form.
DO $$
DECLARE
  chk_name text;
BEGIN
  SELECT conname INTO chk_name
  FROM pg_constraint
  WHERE conrelid = 'chatbot_channel_connections'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%channel_type%';
  IF chk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE chatbot_channel_connections DROP CONSTRAINT %I', chk_name);
  END IF;
END $$;

ALTER TABLE chatbot_channel_connections
  ADD CONSTRAINT chatbot_channel_connections_channel_type_check
  CHECK (channel_type IN ('zalo_oa', 'facebook', 'whatsapp'));

-- 2. Partial UNIQUE indexes (CREATE UNIQUE INDEX is the only form that
--    supports `WHERE` — PostgreSQL does NOT allow `ADD CONSTRAINT ... UNIQUE
--    ... WHERE`):
--    - Legacy single-row guarantee for Zalo OA and Facebook (preserves
--      behavior of existing rows and avoids touching their NULL external ids).
--    - Multi-row uniqueness for WhatsApp that includes external_channel_id
--      (the phone_number_id).
CREATE UNIQUE INDEX IF NOT EXISTS uq_chatbot_channel_legacy
  ON chatbot_channel_connections(id_chatbot, channel_type)
  WHERE channel_type IN ('zalo_oa', 'facebook');

CREATE UNIQUE INDEX IF NOT EXISTS uq_chatbot_channel_whatsapp
  ON chatbot_channel_connections(id_chatbot, channel_type, external_channel_id)
  WHERE channel_type = 'whatsapp';

COMMENT ON INDEX uq_chatbot_channel_legacy
  IS 'Legacy single-row-per-(chatbot,channel) guarantee for Zalo OA and Facebook.';
COMMENT ON INDEX uq_chatbot_channel_whatsapp
  IS 'Allow multiple WhatsApp accounts per chatbot keyed by phone_number_id.';

-- 3. Add WhatsApp-specific columns. All NULL-able so they do not break
--    Zalo OA / Facebook rows.
ALTER TABLE chatbot_channel_connections
  ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32),
  ADD COLUMN IF NOT EXISTS waba_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS phone_number_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS business_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS app_id VARCHAR(64);

COMMENT ON COLUMN chatbot_channel_connections.phone_number
  IS 'WhatsApp display phone number (E.164-ish), used in ChannelSettings UI.';
COMMENT ON COLUMN chatbot_channel_connections.waba_id
  IS 'WhatsApp Business Account ID — used to subscribe webhooks.';
COMMENT ON COLUMN chatbot_channel_connections.phone_number_id
  IS 'WhatsApp phone_number_id used to call the Graph API (separate from phone_number).';
COMMENT ON COLUMN chatbot_channel_connections.business_id
  IS 'Meta Business ID — for multi-business switching (PR 2).';
COMMENT ON COLUMN chatbot_channel_connections.app_id
  IS 'Meta App ID that issued the OAuth token — for audit / multi-app support.';

-- 4. Lookup index for webhook flows that fall back to phone_number_id.
CREATE INDEX IF NOT EXISTS idx_chatbot_channels_phone_id
  ON chatbot_channel_connections(phone_number_id)
  WHERE phone_number_id IS NOT NULL;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Part B — chatbot_whatsapp_account_settings (new table)             ║
-- ╚══════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS chatbot_whatsapp_account_settings (
  id                    BIGSERIAL PRIMARY KEY,
  id_user               BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_channel_connection INTEGER NOT NULL REFERENCES chatbot_channel_connections(id) ON DELETE CASCADE,
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
  CONSTRAINT uq_chatbot_whatsapp_account_chatbot
    UNIQUE (id_user, id_channel_connection, id_chatbot)
);

COMMENT ON TABLE chatbot_whatsapp_account_settings
  IS 'Per-(user, WhatsApp account, chatbot) AI enable flag and optional overrides. Mirrors chatbot_zalo_account_settings but refs chatbot_channel_connections (multi-account per chatbot).';
COMMENT ON CONSTRAINT uq_chatbot_whatsapp_account_chatbot ON chatbot_whatsapp_account_settings
  IS 'Each (user, WhatsApp account, chatbot) tuple is independent — toggling one chatbot does NOT affect others sharing the same WhatsApp account.';

CREATE INDEX IF NOT EXISTS idx_chatbot_whatsapp_settings_user
  ON chatbot_whatsapp_account_settings(id_user);
CREATE INDEX IF NOT EXISTS idx_chatbot_whatsapp_settings_channel
  ON chatbot_whatsapp_account_settings(id_channel_connection);
CREATE INDEX IF NOT EXISTS idx_chatbot_whatsapp_settings_chatbot
  ON chatbot_whatsapp_account_settings(id_chatbot)
  WHERE id_chatbot IS NOT NULL;
