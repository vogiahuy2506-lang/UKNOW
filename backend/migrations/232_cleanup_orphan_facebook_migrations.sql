-- Migration 232 — Cleanup orphan migration history rows
-- Reason: 222_facebook_fca_channel.sql, 223_facebook_fca_session_appstate.sql, and
-- 224_facebook_fca_chatbot_settings.sql were an earlier Facebook Messenger
-- design that was replaced by 231_facebook_channel_connections.sql before being
-- committed to disk. Their checksum rows in schema_migrations now point at
-- files that don't exist, blocking --check and producing a noisy startup warning.
--
-- Safe to run once on every environment (DELETE … WHERE NOT EXISTS is a no-op
-- on a clean DB) and idempotent under re-runs because it only deletes the
-- three specific filenames.
DELETE FROM schema_migrations
 WHERE filename IN (
   '222_facebook_fca_channel.sql',
   '223_facebook_fca_session_appstate.sql',
   '224_facebook_fca_chatbot_settings.sql'
 );
