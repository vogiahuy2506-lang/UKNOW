-- Migration 126: leads.custom_fields snapshot JSONB for landing form custom values.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_custom_fields_object_check'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_custom_fields_object_check
      CHECK (jsonb_typeof(custom_fields) = 'object');
  END IF;
END $$;
