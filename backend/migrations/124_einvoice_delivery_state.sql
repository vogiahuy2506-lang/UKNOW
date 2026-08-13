-- Migration 124: einvoice worker lease + email delivery state

ALTER TABLE einvoices
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_status VARCHAR(24),
  ADD COLUMN IF NOT EXISTS email_attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_last_error TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'einvoices_status_check'
  ) THEN
    ALTER TABLE einvoices DROP CONSTRAINT einvoices_status_check;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Recreate status check including processing (drop unnamed check if present)
DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'einvoices'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE einvoices DROP CONSTRAINT %I', cname);
  END LOOP;

  ALTER TABLE einvoices
    ADD CONSTRAINT einvoices_status_check
    CHECK (status IN ('pending', 'processing', 'issued', 'failed', 'cqt_ok', 'cqt_rejected'));
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'einvoices_email_status_check'
  ) THEN
    ALTER TABLE einvoices
      ADD CONSTRAINT einvoices_email_status_check
      CHECK (
        email_status IS NULL
        OR email_status IN ('pending', 'sending', 'sent', 'failed')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_einvoices_worker_claim
  ON einvoices (status, next_attempt_at, updated_at);

CREATE INDEX IF NOT EXISTS idx_einvoices_email_worker
  ON einvoices (email_status, email_next_attempt_at, email_last_attempt_at);
