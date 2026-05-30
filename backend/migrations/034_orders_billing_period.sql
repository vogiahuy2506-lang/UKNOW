-- Thêm billing_period vào orders để phân biệt thanh toán tháng vs năm.
-- 'monthly' = 1 tháng, 'yearly' = 1 năm.
-- DEFAULT 'monthly' để không ảnh hưởng các đơn hàng cũ.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS billing_period VARCHAR(10) NOT NULL DEFAULT 'monthly'
    CHECK (billing_period IN ('monthly', 'yearly'));
