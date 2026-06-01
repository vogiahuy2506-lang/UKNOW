-- Seed voucher mẫu sau khi voucher schema đã được tạo.
-- File riêng vì nếu 036_vouchers.sql đã chạy trước đó, sửa thêm seed vào 036 sẽ không được migration runner chạy lại.

BEGIN;

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

COMMIT;
