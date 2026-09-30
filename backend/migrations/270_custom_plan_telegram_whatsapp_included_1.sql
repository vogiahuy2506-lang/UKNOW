-- 30/09/2026 — Goi tuy chinh: Telegram/WhatsApp giong Zalo/email (min 1, kem san 1 trong gia goc).
-- Migration 269 seed min/included = 0 -> khach de 0 -> cot max_*_accounts = 0 -> tai khoan TG/WA dang dung bi KHOA sau 7 ngay
-- (khac goi cu NULL = khong gioi han). Zalo/email chua bao gio co tinh huong nay vi min/included = 1 (migration 096/097).
-- Chi UPDATE 2 dong cau hinh, khong dong toi don/gói da mua.
UPDATE custom_plan_pricing
   SET included_qty = 1,
       min_qty      = 1,
       updated_at   = NOW()
 WHERE item_key IN ('telegram_accounts', 'whatsapp_accounts')
   AND (included_qty <> 1 OR min_qty <> 1);
