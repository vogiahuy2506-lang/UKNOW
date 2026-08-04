-- Migration 095: per-conversation AI handoff (pause bot when owner replies)
BEGIN;

ALTER TABLE zalo_personal_conversations
  ADD COLUMN IF NOT EXISTS ai_paused BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_paused_at TIMESTAMPTZ NULL;

ALTER TABLE channel_conversations
  ADD COLUMN IF NOT EXISTS ai_paused BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_paused_at TIMESTAMPTZ NULL;

ALTER TABLE webchat_conversations
  ADD COLUMN IF NOT EXISTS ai_paused BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_paused_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_zalo_personal_conv_ai_paused
  ON zalo_personal_conversations (id_user, ai_paused)
  WHERE ai_paused = true;

COMMIT;
