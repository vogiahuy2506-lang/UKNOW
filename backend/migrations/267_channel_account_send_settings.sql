-- Migration 267: Tran gui/ngay + toc do gui theo TAI KHOAN Telegram/WhatsApp
-- (PLAN_TG_WA_DAY_DU_2026-09-29, P4). Khuon migration 236 (email_settings/zalo_settings.user_daily_send_limit)
-- va zalo_settings.zalo_personal_outbound_delay_min_ms/max_ms.
--
-- Telegram: co bang tai khoan (telegram_accounts) -> them 3 cot NULL (NULL = khong gioi han / theo env).
-- WhatsApp: KHONG co bang tai khoan (chi whatsapp_baileys_session_creds ma hoa — khong dung toi) -> bang nho
-- rieng khoa theo session_key ("<userId>-<shortKey>").
-- Chi CREATE/ADD COLUMN — khong dong cham du lieu cu.

ALTER TABLE telegram_accounts
  ADD COLUMN IF NOT EXISTS user_daily_send_limit INTEGER NULL,
  ADD COLUMN IF NOT EXISTS outbound_delay_min_ms INTEGER NULL,
  ADD COLUMN IF NOT EXISTS outbound_delay_max_ms INTEGER NULL;

COMMENT ON COLUMN telegram_accounts.user_daily_send_limit IS
  'Gioi han tin/ngay do NGUOI DUNG tu dat cho tai khoan Telegram nay (chien dich). NULL = khong gioi han.';
COMMENT ON COLUMN telegram_accounts.outbound_delay_min_ms IS
  'Ghi de khoang cach toi thieu giua 2 tin (ms) theo 3 muc toc do; NULL = theo env. Khong bao gio duoi san cung (channelSendSpeed.util.js).';
COMMENT ON COLUMN telegram_accounts.outbound_delay_max_ms IS
  'Ghi de khoang cach toi da giua 2 tin (ms); NULL = theo env.';

CREATE TABLE IF NOT EXISTS whatsapp_account_settings (
  session_key           TEXT        PRIMARY KEY,
  id_user               BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_daily_send_limit INTEGER     NULL,
  outbound_delay_min_ms INTEGER     NULL,
  outbound_delay_max_ms INTEGER     NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_account_settings_user
  ON whatsapp_account_settings (id_user);

COMMENT ON TABLE whatsapp_account_settings IS
  'Cau hinh gui theo tai khoan WhatsApp (session_key = "<userId>-<shortKey>"): gioi han tin/ngay + toc do gui. NULL = mac dinh (khong gioi han / theo env).';
