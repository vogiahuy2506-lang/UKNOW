-- Migration 268: khoa tai khoan WhatsApp sau ha goi (PLAN_TG_WA_DAY_DU, P6).
--
-- topup_locked_resources.resource_id la BIGINT (id so cua bang tai nguyen). Tai khoan WhatsApp khong co bang
-- tai khoan co id so (phien nam o whatsapp_baileys_session_creds, khoa la session_key TEXT) nen them id so vao
-- bang whatsapp_account_settings (migration 267) va dung id nay lam resource_id khi khoa.
-- KHONG doi PK (session_key). Dong settings duoc tao khi phien mo / khi reconcile can (getOrCreate) — phien
-- ton tai la do whatsapp_baileys_session_creds, khong phai do bang nay.
-- Chi ADD COLUMN / CREATE INDEX — khong dong cham du lieu cu.

ALTER TABLE whatsapp_account_settings
  ADD COLUMN IF NOT EXISTS id BIGSERIAL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_account_settings_id
  ON whatsapp_account_settings (id);

COMMENT ON COLUMN whatsapp_account_settings.id IS
  'Id so on dinh cua tai khoan WhatsApp, dung lam topup_locked_resources.resource_id (resource_key = whatsapp_accounts).';
