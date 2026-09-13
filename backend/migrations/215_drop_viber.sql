-- Migration 215: Drop all Viber tables and clear orphaned migration rows
--
-- The Viber channel was removed from the product in 2026-09; no production
-- code path remains. Two earlier migrations (210_create_viber_accounts.sql,
-- 211_add_viber_session_blob.sql) were deleted from the repository while
-- their rows remained in schema_migrations — that blocked `npm run migrate
-- --check` and every CI run. This migration tears down the leftover tables
-- AND cleans up those orphan rows so the checksum check passes again.
--
-- This script is intentionally idempotent (DROP TABLE IF EXISTS) so it is
-- safe to re-run on a partially-applied database or in tests.
--
-- allow-destructive-ddl: feature removed; no active users depend on these
-- tables (Viber accounts table had only seeded accounts from 2026-09-12).

-- 1) Drop Viber tables (child → parent ordering: messages → conversations →
--    settings → accounts). CASCADE handles FKs even if order slips.
DROP TABLE IF EXISTS viber_personal_messages CASCADE;
DROP TABLE IF EXISTS viber_personal_conversations CASCADE;
DROP TABLE IF EXISTS viber_chatbot_settings CASCADE;
DROP TABLE IF EXISTS viber_accounts CASCADE;

-- 2) Remove the two orphan rows so the migration runner's checksum check
--    stops complaining that "file lịch sử không còn trên đĩa".
--    No DDL happened in this migration beyond the drops above, so we
--    don't INSERT a fresh row for 210/211.
DELETE FROM schema_migrations WHERE filename IN (
  '210_create_viber_accounts.sql',
  '211_add_viber_session_blob.sql'
);
