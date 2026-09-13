-- Migration 212: Add session_string column to telegram_accounts
--
-- Until now, Telegram session strings were stored in a separate SQLite
-- DB managed by the Python `telegram-gateway` (FastAPI) process. We
-- are collapsing the gateway into the Node.js backend, so the session
-- now lives next to the ownership row in Postgres.
--
-- `session_string` is an opaque text payload from the Telegram
-- transport (e.g. Telethon's `StringSession.save()` output). Stored as
-- TEXT because it is already an opaque string; no JSONB needed.

ALTER TABLE telegram_accounts
  ADD COLUMN IF NOT EXISTS session_string TEXT;

-- Updated_at trigger already covers this column (created in migration 050).
