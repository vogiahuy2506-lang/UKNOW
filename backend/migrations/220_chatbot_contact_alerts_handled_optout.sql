-- 220_chatbot_contact_alerts_handled_optout.sql
-- Thêm cột đánh dấu đã xử lý cho liên hệ khách để lại, và công tắc email thông báo cho chủ shop

ALTER TABLE chatbot_contact_alerts
  ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handled_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chatbot_contact_alerts_user_handled
  ON chatbot_contact_alerts (id_user, handled_at);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS chatbot_contact_alert_email BOOLEAN NOT NULL DEFAULT true;
