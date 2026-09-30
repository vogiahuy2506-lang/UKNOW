-- P11 (PLAN_TG_WA_DAY_DU muc 18, 30/09/2026) — Hop thu tra loi tay Telegram/WhatsApp di qua cong han muc + tran tin le theo so tai khoan.
--
-- Viec A: tin tra loi tay o Hop thu (type 'channel': Telegram / WhatsApp Baileys) truoc day KHONG dat cho han muc, KHONG tru vi top-up,
--   KHONG duoc dem. Them cot channel_messages.quota_reservation_id (giong zalo_personal_messages, migration 178) de o mode enforce dong tin
--   gan voi dong dat cho (dem qua ledger, khong cong hai lan) va retry biet dat cho truoc do da consumed/uncertain hay chua.
--   Cot rong o mode off/shadow (production hien la shadow): khi do dem thang tinh truc tiep tu channel_messages.
-- Viec B: nang luc tin le theo so tai khoan cho Telegram/WhatsApp — 16.000 tin/thang/tai khoan = dung so cua Zalo (migration 096); gia tri
--   admin doi duoc o Quan ly goi -> Gia goi tuy chinh. ON CONFLICT DO NOTHING de chay lai khong ghi de gia tri admin da sua.

ALTER TABLE channel_messages ADD COLUMN IF NOT EXISTS quota_reservation_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_quota_reservation_id
  ON channel_messages (quota_reservation_id)
  WHERE quota_reservation_id IS NOT NULL;

INSERT INTO custom_plan_pricing (item_key, plan_column, unit_price, unit_size, included_qty, min_qty, max_qty, step_qty, is_active, sort_order)
VALUES
  ('telegram_monthly_capacity_per_account', NULL, 16000, 1, 0, 0, NULL, 1, TRUE, 0),
  ('whatsapp_monthly_capacity_per_account', NULL, 16000, 1, 0, 0, NULL, 1, TRUE, 0)
ON CONFLICT (item_key) DO NOTHING;
