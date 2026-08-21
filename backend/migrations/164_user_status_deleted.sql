-- Migration 164: Thêm giá trị 'deleted' vào enum user_status.
--
-- Dùng cho tính năng "Gỡ email khỏi tài khoản" (detach-email) — giải phóng email
-- gốc để đăng ký lại được, giữ nguyên dữ liệu (đơn hàng, hoá đơn) thay vì xoá cứng.
-- 'inactive' đã có nghĩa riêng (tài khoản bị khoá tạm thời, admin có thể mở lại),
-- không dùng lại cho trường hợp này để tránh lẫn 2 khái niệm khác nhau.
--
-- ALTER TYPE ... ADD VALUE không dùng được giá trị mới trong CÙNG transaction nó
-- được thêm (Postgres 12+) — migration này chỉ thêm giá trị, không UPDATE gì cả.
ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'deleted';
