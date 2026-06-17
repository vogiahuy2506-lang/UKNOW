-- Diagnostic account_id is now polymorphic by channel:
--   zalo_personal/zalo_group -> zalo_settings.id
--   email                    -> email_settings.id
-- Application adapters validate the account against the correct table.

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname
    INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_class ref ON ref.oid = con.confrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'diagnostic_runs'
    AND ref.relname = 'zalo_settings'
    AND con.contype = 'f'
    AND con.conkey = ARRAY[
      (
        SELECT attnum
        FROM pg_attribute
        WHERE attrelid = rel.oid
          AND attname = 'account_id'
      )
    ]::SMALLINT[]
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE diagnostic_runs DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE diagnostic_messages
  ADD COLUMN IF NOT EXISTS dry_run BOOLEAN NOT NULL DEFAULT FALSE;
