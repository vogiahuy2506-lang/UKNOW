-- Voucher/promotion engine for checkout discounts.

CREATE TABLE IF NOT EXISTS vouchers (
  id                         BIGSERIAL PRIMARY KEY,
  code                       VARCHAR(64) NOT NULL UNIQUE,
  name                       VARCHAR(160) NOT NULL,
  description                TEXT,
  discount_type              VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value             NUMERIC(12, 2) NOT NULL CHECK (discount_value >= 0),
  max_discount_amount        NUMERIC(12, 2),
  min_order_amount           NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0),
  applies_to_plan_codes      TEXT[],
  applies_to_billing_periods TEXT[],
  starts_at                  TIMESTAMPTZ,
  ends_at                    TIMESTAMPTZ,
  usage_limit                INTEGER CHECK (usage_limit IS NULL OR usage_limit >= 0),
  usage_limit_per_user       INTEGER CHECK (usage_limit_per_user IS NULL OR usage_limit_per_user >= 0),
  used_count                 INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  auto_apply                 BOOLEAN NOT NULL DEFAULT FALSE,
  stackable                  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vouchers_active_auto
  ON vouchers (is_active, auto_apply, starts_at, ends_at);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS original_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voucher_id BIGINT REFERENCES vouchers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(64);

UPDATE orders
SET original_amount = amount
WHERE original_amount IS NULL;

-- Mở rộng constraint payment_method để cho phép 'voucher' (thanh toán 100% bằng voucher)
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_status_check,
  DROP CONSTRAINT IF EXISTS orders_payment_method_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IN ('payos', 'manual', 'free', 'voucher'));

CREATE TABLE IF NOT EXISTS voucher_redemptions (
  id              BIGSERIAL PRIMARY KEY,
  voucher_id      BIGINT NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  order_id        BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  user_email      VARCHAR(255),
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id)
);

CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_voucher_user
  ON voucher_redemptions (voucher_id, user_id, lower(user_email));

-- Seed voucher mẫu để super_admin có dữ liệu kiểm thử ngay sau migration.
-- Không dùng ON CONFLICT để tránh phụ thuộc constraint name; không ghi đè nếu admin đã tạo/chỉnh code này.
INSERT INTO vouchers (
  code, name, description, discount_type, discount_value, max_discount_amount,
  min_order_amount, applies_to_plan_codes, applies_to_billing_periods,
  starts_at, ends_at, usage_limit, usage_limit_per_user,
  auto_apply, stackable, is_active
)
SELECT
  'AUTO_LAUNCH_10',
  'Ưu đãi ra mắt 10%',
  'Tự động giảm 10% cho mọi gói trả phí.',
  'percentage',
  10,
  300000,
  1,
  NULL,
  ARRAY['monthly', 'yearly'],
  NOW(),
  NOW() + INTERVAL '30 days',
  NULL,
  1,
  TRUE,
  FALSE,
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM vouchers WHERE code = 'AUTO_LAUNCH_10'
);

INSERT INTO vouchers (
  code, name, description, discount_type, discount_value, max_discount_amount,
  min_order_amount, applies_to_plan_codes, applies_to_billing_periods,
  starts_at, ends_at, usage_limit, usage_limit_per_user,
  auto_apply, stackable, is_active
)
SELECT
  'WELCOME50K',
  'Welcome 50K',
  'Nhập mã để giảm 50.000đ cho đơn từ 500.000đ.',
  'fixed_amount',
  50000,
  NULL,
  500000,
  NULL,
  ARRAY['monthly', 'yearly'],
  NOW(),
  NOW() + INTERVAL '90 days',
  1000,
  1,
  FALSE,
  FALSE,
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM vouchers WHERE code = 'WELCOME50K'
);
