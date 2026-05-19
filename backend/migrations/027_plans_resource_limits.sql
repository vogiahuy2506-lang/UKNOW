-- Thêm resource limit columns vào bảng plans.
-- NULL = không giới hạn. Integer = giới hạn cụ thể.
-- Khi user được gán plan → các giá trị này sẽ được sync sang users.max_* tương ứng.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS max_landing_pages   INTEGER,
  ADD COLUMN IF NOT EXISTS max_campaigns       INTEGER,
  ADD COLUMN IF NOT EXISTS max_zalo_accounts   INTEGER,
  ADD COLUMN IF NOT EXISTS max_email_accounts  INTEGER,
  ADD COLUMN IF NOT EXISTS max_email_templates INTEGER,
  ADD COLUMN IF NOT EXISTS max_zalo_templates  INTEGER;

COMMENT ON COLUMN plans.max_landing_pages   IS 'NULL = không giới hạn';
COMMENT ON COLUMN plans.max_campaigns       IS 'NULL = không giới hạn';
COMMENT ON COLUMN plans.max_zalo_accounts   IS 'NULL = không giới hạn';
COMMENT ON COLUMN plans.max_email_accounts  IS 'NULL = không giới hạn';
COMMENT ON COLUMN plans.max_email_templates IS 'NULL = không giới hạn';
COMMENT ON COLUMN plans.max_zalo_templates  IS 'NULL = không giới hạn';
