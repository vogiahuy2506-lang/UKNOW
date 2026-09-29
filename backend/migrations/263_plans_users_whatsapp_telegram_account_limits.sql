-- W5: han muc so tai khoan WhatsApp + Telegram theo goi (PLAN_WHATSAPP_DOT3_2026-09-29).
-- NULL = khong gioi han (goi hien tai KHONG doi hanh vi), 0 = khong ho tro. users.* duoc dong bo tu plans.* khi kich hoat goi.
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS max_whatsapp_accounts INTEGER,
  ADD COLUMN IF NOT EXISTS max_telegram_accounts INTEGER;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS max_whatsapp_accounts INTEGER,
  ADD COLUMN IF NOT EXISTS max_telegram_accounts INTEGER;
