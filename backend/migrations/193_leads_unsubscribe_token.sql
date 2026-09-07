-- Migration 193: Thêm unsubscribe_token và consent_withdrawn_at cho leads
-- Fix: column "unsubscribe_token" does not exist

ALTER TABLE leads ADD COLUMN IF NOT EXISTS unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_unsubscribe_token_unique'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_unsubscribe_token_unique UNIQUE (unsubscribe_token);
  END IF;
END $$;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_withdrawn_at TIMESTAMPTZ NULL;
