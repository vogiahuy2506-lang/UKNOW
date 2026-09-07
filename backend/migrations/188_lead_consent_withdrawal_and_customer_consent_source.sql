-- Migration 188: Đường rút lại đồng ý cho lead + nguồn đồng ý cho khách hàng (Nghị định 330/2026/NĐ-CP)

-- 1. Leads: thêm unsubscribe_token (UUID, unique, tự sinh) và consent_withdrawn_at
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

-- 2. Customers: thêm consent_source VARCHAR(30) NULL
ALTER TABLE customers ADD COLUMN IF NOT EXISTS consent_source VARCHAR(30) NULL;
CREATE INDEX IF NOT EXISTS idx_customers_consent_source ON customers(consent_source);
