-- Thêm thời hạn gói (duration_days) và giá năm (price_yearly) vào bảng plans.
-- duration_days: số ngày một kỳ đăng ký (10 = dùng thử, 30 = tháng, 365 = năm).
-- NULL = legacy — backend sẽ fallback về 30 ngày khi gán gói.
-- price_yearly: giá niêm yết theo năm để hiển thị trên trang pricing.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS duration_days  INTEGER,
  ADD COLUMN IF NOT EXISTS price_yearly   BIGINT;

COMMENT ON COLUMN plans.duration_days IS 'Số ngày một kỳ đăng ký. NULL = fallback 30 ngày.';
COMMENT ON COLUMN plans.price_yearly  IS 'Giá niêm yết theo năm (VNĐ). NULL = không hiển thị giá năm.';
