-- Tách giới hạn chiến dịch thành 3 loại riêng biệt:
-- max_zalo_campaigns       → Chiến dịch Zalo Cá nhân
-- max_zalo_group_campaigns → Chiến dịch Zalo Nhóm
-- max_email_campaigns      → Chiến dịch Email
-- NULL = không giới hạn. 0 = không hỗ trợ.
-- max_campaigns (cũ) giữ lại để backward compat.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS max_zalo_campaigns       INTEGER,
  ADD COLUMN IF NOT EXISTS max_zalo_group_campaigns INTEGER,
  ADD COLUMN IF NOT EXISTS max_email_campaigns      INTEGER;

COMMENT ON COLUMN plans.max_zalo_campaigns       IS 'Số chiến dịch Zalo cá nhân tối đa / tháng. NULL = không giới hạn, 0 = không hỗ trợ.';
COMMENT ON COLUMN plans.max_zalo_group_campaigns IS 'Số chiến dịch Zalo nhóm tối đa / tháng. NULL = không giới hạn, 0 = không hỗ trợ.';
COMMENT ON COLUMN plans.max_email_campaigns      IS 'Số chiến dịch Email tối đa / tháng. NULL = không giới hạn, 0 = không hỗ trợ.';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS max_zalo_campaigns       INTEGER,
  ADD COLUMN IF NOT EXISTS max_zalo_group_campaigns INTEGER,
  ADD COLUMN IF NOT EXISTS max_email_campaigns      INTEGER;

COMMENT ON COLUMN users.max_zalo_campaigns       IS 'Sync từ plans.max_zalo_campaigns khi gán gói.';
COMMENT ON COLUMN users.max_zalo_group_campaigns IS 'Sync từ plans.max_zalo_group_campaigns khi gán gói.';
COMMENT ON COLUMN users.max_email_campaigns      IS 'Sync từ plans.max_email_campaigns khi gán gói.';
