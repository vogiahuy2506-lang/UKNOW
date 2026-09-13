-- Migration 214: Persist WhatsApp Baileys profile metadata in Postgres
--
-- Background:
-- Migration 213 moved the *auth state* (AuthenticationCreds + signal
-- keys) out of `./whatsapp-sessions/<sessionKey>/` and into two
-- Postgres tables. The on-disk folder still kept ONE file:
-- `profile.json` — a tiny { meId, meName } blob the UI reads at
-- boot to render the account label before the socket hydrates.
--
-- That folder is the ONLY remaining per-session on-disk state for
-- WhatsApp Baileys, but it still defeats the goals of 213:
--
--   * Multi-instance deploys (>= 2 Node processes behind a LB)
--     can't share profile metadata. Process B doesn't know the
--     display name until the socket reconnects.
--   * A fresh container with no mounted volume treats every
--     re-deploy as a fresh install — profile.json is gone, the
--     UI shows "WhatsApp Account" until the next reconnect.
--   * `rmSync(SESSION_ROOT/<sessionKey>)` in the logout path
--     leaves orphaned files if the host's disk is full or
--     write-protected (Docker read-only rootfs etc).
--
-- This migration replaces profile.json with a single row per
-- session. The schema mirrors the existing on-disk fields so the
-- backfill is a straight `JSON.parse(readFileSync(...))` + INSERT
-- — no field reshaping.

BEGIN;

CREATE TABLE IF NOT EXISTS whatsapp_baileys_session_profile (
  session_key VARCHAR(255) PRIMARY KEY
    REFERENCES whatsapp_baileys_session_creds(session_key)
    ON DELETE CASCADE,
  me_id       VARCHAR(64),
  me_name     TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE whatsapp_baileys_session_profile IS
  'Lightweight display metadata (meId + meName) per Baileys session. Authoritative source as of migration 214; replaces whatsapp-sessions/<key>/profile.json.';
COMMENT ON COLUMN whatsapp_baileys_session_profile.me_id IS
  'WhatsApp JID returned by Baileys on connection.open (e.g. "5511…@s.whatsapp.net"). Null until first successful scan.';
COMMENT ON COLUMN whatsapp_baileys_session_profile.me_name IS
  'WhatsApp pushName / verifiedName. Null until first successful scan or until the user renames the session.';

COMMIT;
