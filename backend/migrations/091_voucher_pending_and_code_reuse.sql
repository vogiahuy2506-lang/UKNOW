-- Voucher hardening: pending-order quota index + allow code reuse via soft-archive.
-- See PLAN_VOUCHER.md (V-1, V-2b).

CREATE INDEX IF NOT EXISTS idx_orders_voucher_pending
  ON orders (voucher_id, status, created_at)
  WHERE voucher_id IS NOT NULL;

-- usage_limit_per_user = 0 historically meant "unlimited" but is ambiguous for admins.
-- Normalize to NULL (= unlimited) before enforcing integer > 0 in app validation.
UPDATE vouchers
SET usage_limit_per_user = NULL,
    updated_at = NOW()
WHERE usage_limit_per_user = 0;

-- usage_limit = 0 historically blocked all redemptions. Form no longer accepts 0 on save.
-- Deactivate first (keep blocked), then clear 0 so restore/edit does not 400.
UPDATE vouchers
SET is_active = FALSE,
    usage_limit = NULL,
    updated_at = NOW()
WHERE usage_limit = 0;

-- Drop global UNIQUE on code (name may be vouchers_code_key or vouchers_code_unique).
ALTER TABLE vouchers DROP CONSTRAINT IF EXISTS vouchers_code_key;
ALTER TABLE vouchers DROP CONSTRAINT IF EXISTS vouchers_code_unique;
DROP INDEX IF EXISTS vouchers_code_key;
DROP INDEX IF EXISTS vouchers_code_unique;

CREATE UNIQUE INDEX IF NOT EXISTS vouchers_code_active_uniq
  ON vouchers (code)
  WHERE is_active = TRUE;
