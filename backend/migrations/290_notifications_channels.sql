-- 290: ban tin admin chon kenh gui (email / chuong) - PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO_2026-10-10 PR-3.
--
-- Truoc day bang `notifications` (Trung tam Chien dich Email) chi co mot kenh la email. Tu PR-1 co chuong thong bao
-- (user_notifications), PR-3 cho admin chon kenh cho TUNG ban tin luc gui:
--   * channels     : tap con cua {email, in_app}, khong rong. Ban tin cu mac dinh '{email}' (dung hanh vi cu - khong ai bi gui them
--                    chuong ngoai y muon). Validate o tang controller (parseNotificationChannels), khong them CHECK de giong cac cot mang khac.
--   * in_app_count : so dong chuong da chen cho ban tin nay (thong ke "chuong: N" o bang lich su). Email van co sent_count/failed_count rieng.
-- Chi ADD COLUMN co DEFAULT hang so (khong rewrite bang), khong DROP/ALTER cot cu.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS channels TEXT[] NOT NULL DEFAULT '{email}',
  ADD COLUMN IF NOT EXISTS in_app_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN notifications.channels IS
  'Kenh gui cua ban tin: tap con khong rong cua {email, in_app}. Mac dinh {email}. Xem utils/notificationChannels.util.js.';
COMMENT ON COLUMN notifications.in_app_count IS
  'So thong bao chuong (user_notifications) da chen cho ban tin nay.';
