-- Migration 168: Add id_chatbot to zalo_personal_conversations
-- Purpose: When a Zalo personal account is shared by multiple chatbots, every
--          conversation needs to know which chatbot it belongs to. Without this,
--          _processZaloPersonalBatch reads the "most recently updated"
--          chatbot_zalo_account_settings row for the (user, zalo) pair → toggling
--          chatbot A silently affects chatbot B and they talk over each other.
--
-- Behaviour:
--   - Existing rows: id_chatbot stays NULL. Old conversations will be routed to
--     the most-recently-enabled chatbot for the (user, zalo) pair (legacy path),
--     and get their id_chatbot back-filled on the first new message.
--   - New rows: getOrCreateConversation() sets id_chatbot to the most recently
--     enabled chatbot for (user, zalo) at the time of creation. If multiple
--     chatbots are enabled for the same zalo, conversations get spread across
--     them (deterministic by id) so a single khách won't jump between bots.
--   - Per-chatbot settings (`chatbot_zalo_account_settings` keyed by
--     (user, zalo, chatbot)) are now the source of truth for which chatbot is
--     on/off, so toggling chatbot A no longer leaks into chatbot B.

BEGIN;

ALTER TABLE zalo_personal_conversations
  ADD COLUMN IF NOT EXISTS id_chatbot BIGINT NULL
  REFERENCES custom_chatbots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_zalo_personal_conv_chatbot
  ON zalo_personal_conversations (id_user, id_zalo_setting, id_chatbot)
  WHERE id_chatbot IS NOT NULL;

COMMENT ON COLUMN zalo_personal_conversations.id_chatbot IS
  'Chatbot that owns this conversation. When multiple chatbots share one Zalo personal account, each conversation is pinned to one chatbot so per-chatbot toggles do not bleed across bots.';

COMMIT;
