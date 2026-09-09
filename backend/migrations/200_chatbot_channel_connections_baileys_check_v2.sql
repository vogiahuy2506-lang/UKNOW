-- Migration 200: widen chatbot_channel_connections.channel_type CHECK constraint to include
-- 'whatsapp_baileys' as a superset value.
--
-- Why a new file instead of editing 199: CI migration-safety check forbids modifying
-- released migrations.  Migration 199 was already shipped (syntax error came from
-- earlier em-dash / encoding issue); creating a follow-up 200 keeps the schema
-- migration history append-only and idempotent.
--
-- Idempotency: we first DROP the named CHECK constraint if it exists, then re-ADD
-- the broader constraint.  Safe to re-run because pg_constraint has no row when
-- the constraint doesn't exist (DROP IF EXISTS is a no-op).
ALTER TABLE chatbot_channel_connections
  DROP CONSTRAINT IF EXISTS chatbot_channel_connections_channel_type_check;

ALTER TABLE chatbot_channel_connections
  ADD CONSTRAINT chatbot_channel_connections_channel_type_check
  CHECK (channel_type IN ('zalo_oa', 'facebook', 'whatsapp', 'whatsapp_baileys'));
