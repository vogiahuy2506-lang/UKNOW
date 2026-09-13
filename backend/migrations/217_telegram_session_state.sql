-- Migration 217: Persist Telegram (mtcute) session state in Postgres
--
-- Until now, the in-process gateway wrote mtcute's auth state to a
-- per-account SQLite file under `.telegram-sessions/<storageKey>/client.session`
-- (mtcute's built-in `SqliteStorage` driver over `better-sqlite3`). That has
-- three problems for a multi-instance / multi-host deployment:
--
--   1. State is local to one container/process. A second Node instance
--      behind a load balancer can't pick up an existing session — the
--      user would have to re-scan the QR.
--   2. Backups must copy a directory on disk instead of dumping a
--      Postgres row.
--   3. Migration to a new host (Docker image swap, k8s pod reschedule)
--      needs a separate fs copy step.
--
-- One new table replaces the on-disk store:
--
--   telegram_session_state
--     One row per `telegram_user_id`. Stores the entire mtcute StorageProvider
--     state (kv + authKeys + peers + refMessages + self + primaryDcs) as a
--     single AES-256-GCM-encrypted JSONB blob. The blob is opaque to Postgres
--     — the schema lives in `@mtcute/core/storage/memory`'s in-memory repos.
--
-- Why a single JSONB blob (not normalised 5 tables):
-- mtcute's `StorageProvider` interface does not expose per-key public APIs
-- the way Baileys' `SignalKeyStore.get(type, ids)` does — operators only
-- ever need the whole state at once. The blob is small (~5-50 KB per
-- account, dominated by peer metadata) and is rewritten as a single UPSERT
-- on every `StorageManager.save()` event (driven by mtcute's `disconnect`,
-- `PeersService.updatePeersFrom`, `CurrentUserService.store`).
--
-- Encryption uses the same wire format as WhatsApp Baileys
-- (`{ enc: "enc:v1:<ivHex>:<authTagHex>:<cipherTextHex>" }` keyed off
-- `SMTP_SECRET_KEY`) so the existing `encryptBaileysBlob` / `decryptBaileysBlob`
-- utilities can be reused without key-rotation ceremony. See
-- `utils/smtpSecretCrypto.js` for the underlying AES-GCM primitive.
--
-- Migration 218 will DROP `telegram_accounts.session_string` (the original
-- placeholder column from migration 212 that the code never actually
-- populated — `MtProtoTelegramClient.saveSession()` returned a marker
-- string `"mtcute:<storageKey>"`).

BEGIN;

CREATE TABLE IF NOT EXISTS telegram_session_state (
  telegram_user_id BIGINT PRIMARY KEY
    REFERENCES telegram_accounts(telegram_user_id)
    ON DELETE CASCADE,
  -- AES-256-GCM-encrypted JSONB blob of the entire mtcute StorageProvider
  -- state. Encrypted at the boundary in the service layer via the same
  -- `encryptBaileysBlob`/`decryptBaileysBlob` helpers used by WhatsApp;
  -- this column is opaque to Postgres. Schema is owned by `@mtcute/core`.
  state              JSONB        NOT NULL,
  schema_version     INTEGER      NOT NULL DEFAULT 1,
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE telegram_session_state IS
  'One row per Telegram account. AES-256-GCM-encrypted JSONB blob holding the entire mtcute StorageProvider state (kv, authKeys, peers, refMessages, self, primaryDcs). Replaces the on-disk SQLite file at .telegram-sessions/<storageKey>/client.session as the source of truth.';
COMMENT ON COLUMN telegram_session_state.state IS
  'JSONB blob of the entire mtcute auth state, wrapped as { enc: "enc:v1:..." } at the service layer. Opaque to Postgres — schema lives in @mtcute/core.';
COMMENT ON COLUMN telegram_session_state.schema_version IS
  'Bumped when the in-memory state shape produced by `telegramMtProtoStorage.js` changes in a non-backwards-compatible way. Lets future readers detect and reject old-format blobs instead of silently mis-loading them.';

-- Used by `restoreSessionsFromDb()` at boot to fetch every account in
-- most-recently-active order. The migration runs before any data lives
-- here so a CONCURRENTLY CREATE would have nothing to wait on — we keep
-- the regular CREATE to stay idempotent across re-runs.
CREATE INDEX IF NOT EXISTS idx_telegram_session_state_updated
  ON telegram_session_state(updated_at DESC);

COMMIT;
