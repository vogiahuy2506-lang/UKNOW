-- Allow inbox outbound uploads to be catalogued (media library cron by expires_at).
-- Drop any existing CHECK on source, then re-add with inbox_outbound.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'chat_attachments'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%source%'
  LOOP
    EXECUTE format('ALTER TABLE chat_attachments DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE chat_attachments
  ADD CONSTRAINT chat_attachments_source_check
  CHECK (source IN ('chatbot_web', 'chatbot_studio', 'ai_assistant', 'inbox_outbound'));
