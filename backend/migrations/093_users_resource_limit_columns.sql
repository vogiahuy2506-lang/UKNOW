-- Bổ sung các cột hạn mức tài nguyên trên bảng `users`.
--
-- Bối cảnh (phát hiện 03/08/2026 khi test voucher):
--   `activateUserPlan` (repositories/payment/payment.repository.js) đồng bộ hạn mức
--   từ plans -> users qua các cột users.max_*. Bảy trong số các cột đó CHƯA từng
--   được tạo bởi bất kỳ migration nào — chúng chỉ tồn tại trên DB production vì
--   được thêm tay từ lâu (bootstrap.sql của test có ghi chú "migration 005-006"
--   nhưng hai file đó không hề chứa DDL này).
--
--   Hệ quả: bất kỳ DB nào dựng lại từ thư mục migrations/ đều thiếu cột, và mọi
--   thao tác kích hoạt gói sẽ lỗi:
--     column "max_landing_pages" of relation "users" does not exist
--
-- An toàn với production: dùng IF NOT EXISTS nên là no-op ở nơi cột đã có.
-- Cột để NULL = không giới hạn, khớp quy ước của plans.max_*.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS max_employees       INTEGER,
  ADD COLUMN IF NOT EXISTS max_campaigns       INTEGER,
  ADD COLUMN IF NOT EXISTS max_zalo_accounts   INTEGER,
  ADD COLUMN IF NOT EXISTS max_email_accounts  INTEGER,
  ADD COLUMN IF NOT EXISTS max_email_templates INTEGER,
  ADD COLUMN IF NOT EXISTS max_zalo_templates  INTEGER,
  ADD COLUMN IF NOT EXISTS max_landing_pages   INTEGER;

-- Các cột đã có sẵn ở mọi môi trường, liệt kê cho đủ bộ:
--   max_zalo_campaigns, max_zalo_group_campaigns, max_email_campaigns,
--   messages_per_period, is_fup_enabled

COMMENT ON COLUMN users.max_landing_pages IS 'NULL = không giới hạn; đồng bộ từ plans khi kích hoạt gói';
COMMENT ON COLUMN users.max_campaigns     IS 'NULL = không giới hạn; đồng bộ từ plans khi kích hoạt gói';
