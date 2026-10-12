-- 298: nhac thanh toan lai sau 2 gio cho don bo do (PLAN_NHAC_THANH_TOAN_LAI_SAU_2_GIO_2026-10-12 PR-A).
--
-- Khach chon goi, dien thong tin nhung khong tra tien (link PayOS song ~20 phut roi het han) -> sau 2 gio he thong gui MOT thu + MOT chuong
-- kem link mo lai trang thanh toan (/checkout?order=<ma don>) de tao link thanh toan MOI. Moi don nhac toi da mot lan.
--
--   orders.payment_reminder_sent_at   : moc da nhac (NULL = chua nhac). Chi ghi khi chuong hoac thu ghi duoc; loi hoan toan thi de NULL, cron lan sau thu lai.
--   idx_orders_payment_reminder_scan  : index tung phan - chi cac don 'cancelled' chua nhac. Bang orders lon dan, tap bo do chi vai chuc dong.
--                                       KHONG gom 'failed': 'failed' la webhook bao SAI SO TIEN (AMOUNT_MISMATCH), tien co the da vao tai khoan
--                                       -> khong duoc gui "don chua thanh toan"; do la viec cua nguoi duyet tay.
--   system_email_templates_key_check  : them khoa 'order_payment_reminder' de super admin sua duoc mau thu (cung khuon 206 / 249).
--   notification_event_settings       : seed su kien order_payment_reminder (chuong + email bat; nguoi dung tat duoc email) - khop catalog
--                                       config/notificationEventCatalog.js (spec catalog do neu thieu).
--
-- LUU Y phoi hop: ban sua CHECK ben duoi la tap hop day du ca 5 khoa. Migration nao SAU 298 ma sua lai CHECK nay thi phai giu du ca
-- 'order_payment_reminder', neu khong super admin se khong luu duoc mau thu nay.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_payment_reminder_scan
  ON orders (created_at)
  WHERE payment_reminder_sent_at IS NULL AND status = 'cancelled';

-- allow-destructive-ddl: metadata-only SUPERSET CHECK (DROP+ADD trong cung transaction, khong table rewrite, khong data scan;
-- gia tri moi bao trum gia tri cu nen moi row hien co van hop le).
ALTER TABLE system_email_templates
  DROP CONSTRAINT IF EXISTS system_email_templates_key_check,
  ADD CONSTRAINT system_email_templates_key_check
    CHECK (template_key IN ('welcome', 'plan_expiring', 'plan_expired', 'employee_invitation', 'order_payment_reminder'));

INSERT INTO notification_event_settings (event_type, in_app_enabled, email_enabled, user_can_disable_email)
VALUES
  ('order_payment_reminder', true, true, true)
ON CONFLICT (event_type) DO NOTHING;
