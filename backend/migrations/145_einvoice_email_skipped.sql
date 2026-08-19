-- Migration 145: Add skipped to einvoices_email_status_check

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'einvoices_email_status_check'
  ) THEN
    ALTER TABLE einvoices DROP CONSTRAINT einvoices_email_status_check;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE einvoices
  ADD CONSTRAINT einvoices_email_status_check
  CHECK (
    email_status IS NULL
    OR email_status IN ('pending', 'sending', 'sent', 'failed', 'skipped')
  );
