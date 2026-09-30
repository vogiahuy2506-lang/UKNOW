-- allow-destructive-ddl: 2 lan DROP+ADD CONSTRAINT trong cung transaction, chi MO RONG (superset) danh sach gia tri cho phep
-- (chk_sqr_channel them telegram/whatsapp; chk_sqr_wallet_item_key + topup_grants_consumable_no_expiry them telegram_messages/
-- whatsapp_messages) nen moi dong hien co van hop le; khong table rewrite.
--
-- P10 (PLAN_TG_WA_DAY_DU muc 17, 30/09/2026) — Han muc tin/thang RIENG cho Telegram va WhatsApp.
-- Truoc do tin Telegram/WhatsApp dem CHUNG vao han muc Zalo (registry quotaChannel='zalo'). Sau migration nay:
--   * plans.monthly_telegram_limit / plans.monthly_whatsapp_limit (NULL = khong gioi han, 0 = khong co kenh). KHONG them
--     vao bang users: han muc tin doc thang tu goi (EFFECTIVE_PLAN_ID_SQL), bang users khong co cot monthly_*_limit nao.
--   * Seed = SAO CHEP han muc Zalo hien co cua tung goi (goi Enterprise Zalo NULL -> TG/WA NULL). Day dung la tran ma tin
--     Telegram/WhatsApp dang bi chan hom nay (vi chung dem vao Zalo) nen khong ai bi siet them, cung khong ai duoc noi.
--     Chi dien cho goi dang NULL de chay lai khong ghi de gia tri admin da sua.
--   * send_quota_reservations mo CHECK kenh + khoa vi (mode enforce; production dang shadow nen chua ghi dong nao).
--   * Mon top-up tieu hao telegram_messages / whatsapp_messages = gia/don vi cua zalo_messages (migration 099), khong dat gia moi.
--   * Goi tuy chinh: dong telegram_messages / whatsapp_messages giong dong zalo_messages (097).
--   * usage_logs: gui nhanh Telegram/WhatsApp truoc day ghi 'zalo_direct_send' (metadata.source = '<kenh>_preview') -> chuyen
--     sang '<kenh>_direct_send' de thang nay khong mat so dem cua kenh moi (va khong con tru vao Zalo).

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS monthly_telegram_limit INTEGER,
  ADD COLUMN IF NOT EXISTS monthly_whatsapp_limit INTEGER;

UPDATE plans
   SET monthly_telegram_limit = monthly_zalo_limit
 WHERE monthly_telegram_limit IS NULL
   AND monthly_zalo_limit IS NOT NULL;

UPDATE plans
   SET monthly_whatsapp_limit = monthly_zalo_limit
 WHERE monthly_whatsapp_limit IS NULL
   AND monthly_zalo_limit IS NOT NULL;

ALTER TABLE send_quota_reservations
  DROP CONSTRAINT IF EXISTS chk_sqr_channel,
  ADD CONSTRAINT chk_sqr_channel CHECK (channel IN ('email', 'zalo', 'telegram', 'whatsapp'));

ALTER TABLE send_quota_reservations
  DROP CONSTRAINT IF EXISTS chk_sqr_wallet_item_key,
  ADD CONSTRAINT chk_sqr_wallet_item_key CHECK (
    (wallet_quantity > 0 AND wallet_item_key IN ('emails', 'zalo_messages', 'telegram_messages', 'whatsapp_messages'))
    OR (wallet_quantity = 0 AND wallet_item_key IS NULL)
  );

ALTER TABLE topup_grants
  DROP CONSTRAINT IF EXISTS topup_grants_consumable_no_expiry,
  ADD CONSTRAINT topup_grants_consumable_no_expiry CHECK (
    item_key NOT IN ('zalo_messages', 'emails', 'ai_credits', 'telegram_messages', 'whatsapp_messages')
    OR cycle_end IS NULL
  );

INSERT INTO topup_pricing (item_key, unit_price, min_qty, step_qty, max_qty, is_active, sort_order)
VALUES
  ('telegram_messages', 100, 50, 50, NULL, TRUE, 11),
  ('whatsapp_messages', 100, 50, 50, NULL, TRUE, 12)
ON CONFLICT (item_key) DO NOTHING;

INSERT INTO custom_plan_pricing
  (item_key, plan_column, unit_price, unit_size, included_qty, min_qty, max_qty, step_qty, is_active, sort_order)
VALUES
  ('telegram_messages', 'monthly_telegram_limit', 30000, 500, 500, 500, 200000, 500, TRUE, 21),
  ('whatsapp_messages', 'monthly_whatsapp_limit', 30000, 500, 500, 500, 200000, 500, TRUE, 22)
ON CONFLICT (item_key) DO NOTHING;

UPDATE usage_logs
   SET resource_type = 'telegram_direct_send'
 WHERE resource_type = 'zalo_direct_send'
   AND metadata->>'source' = 'telegram_preview';

UPDATE usage_logs
   SET resource_type = 'whatsapp_direct_send'
 WHERE resource_type = 'zalo_direct_send'
   AND metadata->>'source' = 'whatsapp_preview';
