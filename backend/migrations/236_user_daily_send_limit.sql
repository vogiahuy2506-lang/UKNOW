-- Migration: Giới hạn gửi/ngày do NGƯỜI DÙNG tự đặt, theo TỪNG TÀI KHOẢN GỬI
-- (PLAN_GIOI_HAN_GUI_THEO_NGAY_2026-09-22, PR-1 Việc 1).
--
-- Không tái dùng email_settings.daily_limit (NOT NULL DEFAULT 1000, migration 132): cột đó
-- không phân biệt được "khách chọn 1000" với "mặc định chưa ai đụng vào", và không nơi nào so
-- sánh nó với daily_sent_count. Cột mới ở đây NULL = không giới hạn, để giữ đúng ý nghĩa đó.

ALTER TABLE email_settings
  ADD COLUMN IF NOT EXISTS user_daily_send_limit INTEGER NULL;
ALTER TABLE zalo_settings
  ADD COLUMN IF NOT EXISTS user_daily_send_limit INTEGER NULL;

COMMENT ON COLUMN email_settings.user_daily_send_limit IS
  'Gioi han tin/ngay do NGUOI DUNG tu dat cho tai khoan gui nay. NULL = khong gioi han. Khac daily_limit (cot cu, khong duoc doc o dau) va khac han muc cua goi.';
COMMENT ON COLUMN zalo_settings.user_daily_send_limit IS
  'Gioi han tin/ngay do NGUOI DUNG tu dat cho nick Zalo nay. NULL = khong gioi han.';

-- Đếm theo sent_at (không phải created_at) để khớp countEmailSentTodayWithLedger /
-- countZaloSentTodayWithLedger — index account_id+created_at đã có (bootstrap.sql) không dùng được.
CREATE INDEX IF NOT EXISTS idx_email_messages_setting_sent
  ON email_messages (id_email_setting, sent_at)
  WHERE id_email_setting IS NOT NULL AND NOT is_preview;
CREATE INDEX IF NOT EXISTS idx_zalo_messages_account_sent
  ON zalo_messages (account_id, sent_at)
  WHERE account_id IS NOT NULL AND NOT is_preview;
