-- Migration 216: Drop all Zalo tables
--
-- The Zalo channel (both Zalo OA and Zalo Personal) is removed from the
-- product in 2026-09; no production code path remains. This migration
-- tears down every zalo_* / chatbot_zalo_* table so the schema reflects
-- the supported channels only (telegram, whatsapp, webchat).
--
-- 9 tables dropped (CASCADE handles FK inter-dependencies even if the
-- drop order slips):
--   - zalo_personal_conversations
--   - zalo_personal_messages
--   - zalo_accounts
--   - zalo_groups
--   - zalo_unreachable_phones
--   - zalo_messages
--   - zalo_settings
--   - zalo_friends
--   - chatbot_zalo_account_settings
--
-- The script is intentionally idempotent (DROP TABLE IF EXISTS) so it
-- is safe to re-run on a partially-applied DB or in tests.
--
-- allow-destructive-ddl: feature removed end-to-end; no active
-- integration tests or production code path touches these tables
-- after this commit. zalo_messages may still be referenced from
-- historical campaign_run_recipient_steps rows (FK to zalo_accounts
-- dropped via CASCADE); the recipient_steps table is shared with
-- other channels and stays.

DROP TABLE IF EXISTS zalo_personal_messages CASCADE;
DROP TABLE IF EXISTS zalo_personal_conversations CASCADE;
DROP TABLE IF EXISTS chatbot_zalo_account_settings CASCADE;
DROP TABLE IF EXISTS zalo_messages CASCADE;
DROP TABLE IF EXISTS zalo_unreachable_phones CASCADE;
DROP TABLE IF EXISTS zalo_groups CASCADE;
DROP TABLE IF EXISTS zalo_accounts CASCADE;
DROP TABLE IF EXISTS zalo_settings CASCADE;
DROP TABLE IF EXISTS zalo_friends CASCADE;
