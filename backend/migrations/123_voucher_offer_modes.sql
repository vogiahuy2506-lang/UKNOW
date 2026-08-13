-- Migration 123: voucher offer modes (public_code | private_code | automatic)
-- + order discount snapshot for audit.

ALTER TABLE vouchers
  ADD COLUMN IF NOT EXISTS offer_mode VARCHAR(24);

UPDATE vouchers
SET offer_mode = CASE WHEN auto_apply THEN 'automatic' ELSE 'public_code' END
WHERE offer_mode IS NULL;

ALTER TABLE vouchers
  ALTER COLUMN offer_mode SET DEFAULT 'public_code';

ALTER TABLE vouchers
  ALTER COLUMN offer_mode SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vouchers_offer_mode_check'
  ) THEN
    ALTER TABLE vouchers
      ADD CONSTRAINT vouchers_offer_mode_check
      CHECK (offer_mode IN ('public_code', 'private_code', 'automatic'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vouchers_offer_mode_eligibility
  ON vouchers (offer_mode, is_active, starts_at, ends_at);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_source VARCHAR(24);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_label VARCHAR(160);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_discount_source_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_discount_source_check
      CHECK (
        discount_source IS NULL
        OR discount_source IN ('public_code', 'private_code', 'automatic')
      );
  END IF;
END $$;
