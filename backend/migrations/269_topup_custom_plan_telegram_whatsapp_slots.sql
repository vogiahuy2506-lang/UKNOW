-- Migration 269: ban le slot + goi tuy chinh cho tai khoan Telegram/WhatsApp (PLAN_TG_WA_DAY_DU, P6).
--
-- KHONG dat gia moi: gia mac dinh = gia hien co cua TK Zalo — ban le 50000/slot/thang (migration 109), goi tuy chinh
-- 40000/don vi (migration 096 -> rebalance 097). Admin doi duoc o trang gia top-up / gia goi tuy chinh co san.
-- Goi tuy chinh: min_qty = included_qty = 0 (khach chon 0 duoc — TG/WA khong bat buoc nhu Zalo).
-- ON CONFLICT DO NOTHING: dong da co (admin da sua gia) khong bi ghi de. Chi INSERT.

INSERT INTO topup_pricing (item_key, unit_price, min_qty, step_qty, max_qty, is_active, sort_order)
VALUES
  ('telegram_accounts', 50000, 1, 1, 50, TRUE, 41),
  ('whatsapp_accounts', 50000, 1, 1, 50, TRUE, 42)
ON CONFLICT (item_key) DO NOTHING;

INSERT INTO custom_plan_pricing
  (item_key, plan_column, unit_price, unit_size, included_qty, min_qty, max_qty, step_qty, is_active, sort_order)
VALUES
  ('telegram_accounts', 'max_telegram_accounts', 40000, 1, 0, 0, 50, 1, TRUE, 51),
  ('whatsapp_accounts', 'max_whatsapp_accounts', 40000, 1, 0, 0, 50, 1, TRUE, 52)
ON CONFLICT (item_key) DO NOTHING;
