-- P3 (PLAN_TG_WA_DAY_DU_2026-09-29 muc 5) - canh bao mat ket noi kenh Zalo ca nhan / Telegram / WhatsApp.
--
-- Bang channel_disconnect_alerts giu MOC BAT DAU mat ket noi + lan bao chu tai khoan cuoi:
--   * Telegram (dang nghe tin) va WhatsApp (open) chi ton tai trong RAM, khong co cot thoi diem nao de doc
--     "mat tu khi nao" -> cron 10 phut quan sat va ghi lai.
--   * Bang nho doc lap, khong dong toi zalo_settings / telegram_accounts (WhatsApp con khong co bang tai khoan).
--   * last_alerted_at giu cooldown 24h xuyen suot cac lan rot/noi lai.
-- Hai luat canh bao admin (telegram_disconnected / whatsapp_disconnected) doc cung bang nay.
-- Chi CREATE + INSERT, khong DROP/ALTER cot cu.

CREATE TABLE IF NOT EXISTS channel_disconnect_alerts (
  channel            VARCHAR(20)  NOT NULL CHECK (channel IN ('zalo_personal', 'telegram', 'whatsapp')),
  account_ref        VARCHAR(255) NOT NULL,
  id_user            BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_label      VARCHAR(255),
  disconnected_since TIMESTAMPTZ,
  last_alerted_at    TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (channel, account_ref)
);

CREATE INDEX IF NOT EXISTS idx_channel_disconnect_alerts_user
  ON channel_disconnect_alerts (id_user);

COMMENT ON TABLE channel_disconnect_alerts IS
  'Moc bat dau mat ket noi cua tai khoan kenh (zalo_personal/telegram/whatsapp). account_ref = zalo_settings.id | telegram_user_id | whatsapp sessionKey. disconnected_since NULL = dang ket noi.';

INSERT INTO alert_rules (
  code, name, description, threshold_value, window_minutes, channel, severity, cooldown_minutes, config
)
VALUES
(
  'telegram_disconnected',
  'Tai khoan Telegram mat ket noi',
  'Tai khoan Telegram khong con nghe tin den qua N phut (nguon: channel_disconnect_alerts)',
  30, 30, 'email', 'critical', 60,
  '{}'::jsonb
),
(
  'whatsapp_disconnected',
  'Tai khoan WhatsApp mat ket noi',
  'Phien WhatsApp khong o trang thai open qua N phut (nguon: channel_disconnect_alerts)',
  30, 30, 'email', 'critical', 60,
  '{}'::jsonb
)
ON CONFLICT (code) DO NOTHING;
