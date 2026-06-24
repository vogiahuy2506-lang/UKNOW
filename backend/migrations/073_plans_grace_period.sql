-- Migration 073: Số ngày ân hạn sau khi gói hết hạn (cấu hình per-plan bởi super admin)

BEGIN;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS grace_period_days INTEGER NOT NULL DEFAULT 0;

ALTER TABLE plans
  DROP CONSTRAINT IF EXISTS plans_grace_period_days_check,
  ADD CONSTRAINT plans_grace_period_days_check
    CHECK (grace_period_days >= 0);

COMMENT ON COLUMN plans.grace_period_days IS
  'Số ngày ân hạn sau subscription_expires_at. 0 = chặn ngay khi hết hạn.';

COMMIT;
