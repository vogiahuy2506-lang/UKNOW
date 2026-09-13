-- Migration 218: Drop the obsolete telegram_accounts.session_string column
--
-- Migration 212 ADDed `telegram_accounts.session_string TEXT` as a
-- placeholder when the plan was to copy the Python gateway's
-- Telethon-style `StringSession` into a TEXT column. That never happened:
--
--   - The production code path (`MtProtoTelegramClient.saveSession()`)
--     returns a marker string `"mtcute:<storageKey>"` instead of
--     serialising the actual session, because mtcute's storage is a
--     multi-table graph (auth_keys, kv, future_salts, default_dcs,
--     peers, refMessages, self) that can't be losslessly flattened
--     into a single string.
--   - The session has been living on disk in mtcute's default
--     `SqliteStorage` driver under `.telegram-sessions/<key>/client.session`.
--
-- Now that migration 217 introduces `telegram_session_state` (a single
-- encrypted JSONB blob holding the full mtcute state), the placeholder
-- column is dead weight. Drop it so future readers don't get tempted to
-- write a half-functional column and then have to migrate again.
--
-- IF EXISTS guards against re-runs and against environments that already
-- pre-dropped the column via a manual op. Foreign keys and grants are
-- unaffected because the column was never referenced by anything other
-- than `chatbotTelegram.repository.{getSessionString,upsertSession,
-- clearSessionString,listAllSessions,bindAccount}` — those methods are
-- themselves being deprecated in the same release.

-- allow-destructive-ddl: column này là placeholder từ migration 212, chưa từng được populate bởi code path production (MtProtoTelegramClient.saveSession() chỉ return marker `"mtcute:<storageKey>"`). Migration 217 đã thay thế bằng `telegram_session_state.state` (encrypted JSONB). Drop column an toàn — không có data thật bị mất, chỉ gỡ bỏ contract cũ. Tương tự pattern WhatsApp Baileys đã DROP `creds` column placeholder trong migration 213.
BEGIN;

ALTER TABLE telegram_accounts DROP COLUMN IF EXISTS session_string;

COMMIT;
