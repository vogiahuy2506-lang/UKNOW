-- Migration 018: Thêm payment_method và note vào orders
-- payment_method: 'payos' | 'manual' | 'free'
--   payos   = thanh toán qua PayOS (tự động)
--   manual  = thu tiền ngoài, admin ghi nhận
--   free    = gán miễn phí / demo, không tính doanh thu
-- note: ghi chú tuỳ chọn của admin khi gán thủ công

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'payos'
    CHECK (payment_method IN ('payos', 'manual', 'free')),
  ADD COLUMN IF NOT EXISTS note TEXT;

-- Các đơn cũ đều là payos (mặc định đã set ở trên)

COMMIT;
