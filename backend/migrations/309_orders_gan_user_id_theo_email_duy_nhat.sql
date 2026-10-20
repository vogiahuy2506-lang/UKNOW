-- PLAN_GOM_MUC_NHE_2026-10-20 PR-2 — gán user_id cho đơn cũ chỉ có user_email.
--
-- Vì sao: "Đơn của tôi" (user.repository.findSuccessfulOrdersForUser) và trạng thái thanh toán (payment.controller.getPaymentStatus) từng
-- khớp đơn `user_id IS NULL` theo email đăng nhập. Email hồ sơ đổi được mà không xác minh, nên đặt email của người khác là xem được đơn
-- cũ của họ. Code mới chỉ còn khớp theo `user_id`; migration này gán user_id cho các đơn cũ để chủ thật vẫn thấy đơn của mình.
--
-- Chỉ gán khi `user_email` (không phân biệt hoa/thường) khớp ĐÚNG MỘT tài khoản. Khớp 0 hoặc từ 2 tài khoản trở lên → bỏ qua, không đoán.
-- Không xoá, không đổi trạng thái / số tiền / thời điểm của đơn nào; chỉ điền cột user_id đang NULL. Chạy lại không đổi gì thêm.
UPDATE orders AS o
   SET user_id = m.user_id
  FROM (
    SELECT o2.id AS order_id, MIN(u.id) AS user_id
      FROM orders AS o2
      JOIN users AS u ON LOWER(u.email) = LOWER(o2.user_email)
     WHERE o2.user_id IS NULL
       AND o2.user_email IS NOT NULL
     GROUP BY o2.id
    HAVING COUNT(DISTINCT u.id) = 1
  ) AS m
 WHERE o.id = m.order_id
   AND o.user_id IS NULL;
