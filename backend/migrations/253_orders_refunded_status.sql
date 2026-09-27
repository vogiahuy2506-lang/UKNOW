-- allow-destructive-ddl: SUPERSET CHECK — DROP + ADD orders_status_check trong cùng một transaction, danh sách mới bao trùm danh sách cũ (thêm 'refunded') nên mọi dòng hiện có vẫn hợp lệ; orders ~630 dòng (production 27/09), bước kiểm lại CHECK không đáng kể.
--
-- PLAN_HOAN_TIEN_DON_HANG_2026-09-27 mục 1.1 — trạng thái đơn 'refunded' cho chức năng admin
-- "Hoàn tiền đơn". Chính sách /refund-policy đã hứa hoàn tiền nhưng hệ thống không có cách
-- ghi nhận: đơn kế toán đã hoàn vẫn 'success' mãi, khách giữ gói, hoa hồng vẫn tính đủ.
--
-- Kiểm trên production 27/09 (`\d orders`): ràng buộc tên đúng `orders_status_check`, chỉ có
-- 4 giá trị pending/success/cancelled/failed, không có giá trị lạ.
--
-- Migration này PHẢI đi cùng commit chặn webhook/claimOrderSuccess/markOrderFailedForReview
-- nhận 'refunded' là trạng thái đã xong — thiếu chặn thì PayOS gửi lại webhook là gói sống lại.

BEGIN;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
    CHECK (status IN ('pending', 'success', 'cancelled', 'failed', 'refunded'));

-- Ảnh chụp kết quả lúc hoàn: gói có bị thu không, hoá đơn xử lý gì, hoa hồng trừ/thiếu bao nhiêu.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at   TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_by   BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_meta   JSONB;

-- Dùng ở PR-2 (hoa hồng): event của đơn đã hoàn bị loại khỏi mọi chỗ tính doanh thu.
ALTER TABLE affiliate_revenue_events ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;

COMMIT;
