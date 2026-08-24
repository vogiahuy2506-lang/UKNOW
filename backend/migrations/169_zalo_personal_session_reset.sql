-- Migration 169: Add session_reset_at to zalo_personal_conversations
-- Purpose: Enable AI context reset for Zalo personal conversations.
--
-- When a visitor messages after a long gap (default: 8 hours since their last
-- message), the AI should start a fresh context instead of reading the entire
-- conversation history. This is the "new session" behaviour the user described:
-- "9am message → reply, 10am message → different session, AI doesn't reply
-- to old messages."
--
-- Implementation:
--   - zalo_personal_conversations gets a new column session_reset_at (TIMESTAMPTZ).
--     When a visitor sends a message, if last_message_at is older than 8 hours
--     (configurable via ZALO_SESSION_GAP_HOURS env var, default 8), we set
--     session_reset_at = NOW(). The AI then only reads messages newer than this.
--
-- Benefits:
--   - No new DB rows needed — conversation stays one row per Zalo UID.
--   - Zero changes to the AI routing / router — only the message-fetch
--     boundary shifts when session_reset_at is updated.
--   - Admin can manually reset session from the inbox UI if needed.
--
-- Backfill:
--   - Existing conversations get session_reset_at = last_message_at so the
--     first message after this migration doesn't trigger an unexpected reset.
--
-- Related: No schema changes needed for zalo_personal_messages.
--
-- Co-Authored-By: Claude <noreply@anthropic.com>

BEGIN;

-- 1. Add session_reset_at column
ALTER TABLE zalo_personal_conversations
  ADD COLUMN IF NOT EXISTS session_reset_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN zalo_personal_conversations.session_reset_at IS
  'Timestamp from which AI reads conversation history. Set to NOW() when a visitor messages after a long gap (> ZALO_SESSION_GAP_HOURS, default 8h). Older messages are excluded from AI context.';

-- 2. Backfill: set session_reset_at = last_message_at for existing conversations
--    so existing users don't experience an accidental first-session reset.
UPDATE zalo_personal_conversations
SET    session_reset_at = COALESCE(last_message_at, NOW())
WHERE  session_reset_at IS NULL;

-- 3. Index for efficient AI message fetching (messages newer than session_reset_at)
--    This is a partial index — only conversations with a reset timestamp need it.
CREATE INDEX IF NOT EXISTS idx_zalo_personal_conv_session_reset
  ON zalo_personal_conversations (session_reset_at DESC)
  WHERE session_reset_at IS NOT NULL;

COMMIT;
