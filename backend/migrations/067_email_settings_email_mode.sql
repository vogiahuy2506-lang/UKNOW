-- Add email sending mode to email_settings.
-- Giá trị mặc định 'platform' giữ nguyên hành vi hiện tại;
-- 'smtp' cho phép gửi qua SMTP riêng của user.
ALTER TABLE email_settings
  ADD COLUMN IF NOT EXISTS email_mode text NOT NULL DEFAULT 'platform';

COMMENT ON COLUMN email_settings.email_mode IS
  'Chế độ gửi email: platform dùng SMTP mặc định hệ thống, smtp dùng SMTP riêng của user.';
