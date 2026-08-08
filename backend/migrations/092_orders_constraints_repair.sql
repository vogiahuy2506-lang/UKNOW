-- Repair orders constraints + normalize legacy status values.
--
-- Bối cảnh (phát hiện 03/08/2026 khi test voucher):
--   1. `orders_payment_method_check` trên DB thật vẫn là bản cũ, KHÔNG có 'voucher'
--      → mọi đơn dùng voucher giảm 100% đều lỗi 500 (payment.service.js ghi
--        payment_method='voucher' khi amount <= 0). Migration 036 có phần sửa này
--        nhưng schema đã trôi lệch — ràng buộc thực tế không khớp lịch sử migration.
--   2. Migration 036 DROP `orders_status_check` rồi KHÔNG thêm lại → cột status
--      nhận mọi chuỗi. Hệ quả: 41 đơn mang status 'completed' (giá trị code không
--      còn dùng), trong đó 6 đơn thuộc user chưa có active_plan_id.
--   3. Trước khi áp P0-5 (`AND o.status = 'success'` trong EFFECTIVE_PLAN_ID_SQL),
--      phải chuẩn hoá 'completed' → 'success', nếu không 6 user đó mất gói dù đã trả tiền.
--
-- ⚠️ QUYẾT ĐỊNH CẦN XÁC NHẬN TRƯỚC KHI CHẠY:
--    'completed' có thực sự đồng nghĩa với 'success' không?
--    Đối chiếu vài đơn với dashboard PayOS để chắc chắn. Nếu KHÔNG đồng nghĩa,
--    bỏ phần UPDATE và thêm 'completed' vào danh sách hợp lệ của CHECK thay thế.

BEGIN;

-- 1. Chuẩn hoá trạng thái cũ.
UPDATE orders
   SET status = 'success', updated_at = NOW()
 WHERE status = 'completed';

-- 2. Khôi phục CHECK trên status (migration 036 xoá mà quên thêm lại).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
    CHECK (status IN ('pending', 'success', 'cancelled', 'failed'));

-- 3. Cho phép payment_method = 'voucher' (đơn giảm 100%).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IN ('payos', 'manual', 'free', 'voucher'));

COMMIT;
