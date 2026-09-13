-- Migration 213: Persist WhatsApp Baileys session state in Postgres
--
-- Until now, the in-process gateway wrote Baileys auth state to
-- `./whatsapp-sessions/<sessionKey>/` (creds.json + dozens of
-- app-state-sync-key-*.json files). That has three problems for a
-- multi-instance deployment:
--
--   1. State is local to one container/process. A second Node
--      instance behind a load balancer can't pick up an existing
--      session — the user would have to re-scan the QR.
--   2. Backups must tar a directory on disk instead of dumping a
--      Postgres row.
--   3. Migration to a new host (Docker image swap, k8s pod reschedule)
--      needs a separate fs copy step.
--
-- Two new tables replace the on-disk store:
--
--   whatsapp_baileys_session_creds
--     One row per sessionKey. Stores the latest `AuthenticationCreds`
--     blob as JSONB. Insert happens on first QR scan; the row is
--     rewritten on every `creds.update` event Baileys emits.
--
--   whatsapp_baileys_session_keys
--     One row per (sessionKey, signal-type, id) triple. Baileys'
--     `SignalKeyStore.set` writes a handful of rows every time a
--     message is sent/received (pre-keys, app-state-sync keys, etc).
--     We use the composite primary key so the same UPSERT pattern
--     works regardless of which key type is being saved.
--
-- The schema mirrors the shape of `useMultiFileAuthState`'s folder
-- layout so the backfill in scripts/backfillBaileysSessions.js can
-- read the existing files and write one row per `creds.json` /
-- `app-state-sync-key-*.json` without re-encoding anything.
--
-- Both columns hold JSONB so future Baileys schema changes don't
-- require a migration — the row just gets a larger JSON payload.
-- The composite PK on (session_key, type, id) keeps writes O(1) and
-- gives us idempotent UPSERTs on Baileys' set().

BEGIN;

CREATE TABLE IF NOT EXISTS whatsapp_baileys_session_creds (
  session_key VARCHAR(255) PRIMARY KEY,
  creds       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE whatsapp_baileys_session_creds IS
  'One row per Baileys sessionKey. Stores the latest AuthenticationCreds blob from Baileys''s creds.update event.';
COMMENT ON COLUMN whatsapp_baileys_session_creds.creds IS
  'JSONB blob of Baileys AuthenticationCreds. Opaque to Postgres — schema lives in @whiskeysockets/baileys.';

CREATE TABLE IF NOT EXISTS whatsapp_baileys_session_keys (
  session_key VARCHAR(255) NOT NULL,
  type        VARCHAR(64)  NOT NULL,
  id          TEXT         NOT NULL,
  value       JSONB        NOT NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_key, type, id)
);

COMMENT ON TABLE whatsapp_baileys_session_keys IS
  'Per-(session, signal-type, key-id) Signal protocol keys Baileys asks us to persist via SignalKeyStore.set.';
COMMENT ON COLUMN whatsapp_baileys_session_keys.type IS
  'One of: app-state-sync-key, pre-key, session, sender-key, app-state-sync-version, lid-mapping, device-list';

-- Index for the legacy lookup `WHERE session_key = ?` done by the
-- session manager at startup (one query per sessionKey).
CREATE INDEX IF NOT EXISTS idx_whatsapp_baileys_session_keys_session
  ON whatsapp_baileys_session_keys(session_key);

COMMIT;
