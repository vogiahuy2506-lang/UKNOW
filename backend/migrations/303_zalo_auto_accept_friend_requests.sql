-- Migration: Zalo cá nhân tự động đồng ý lời mời kết bạn, bật/tắt theo TỪNG NICK
-- (PLAN_ZALO_TU_DONG_DONG_Y_KET_BAN_2026-10-17, Việc 1).
--
-- Mặc định FALSE: không nick nào tự đồng ý cho tới khi chủ tài khoản bật công tắc. Cột NOT NULL
-- DEFAULT FALSE nên ADD COLUMN không khoá bảng lâu (PG >= 11 chỉ ghi metadata) và chạy lại được.

ALTER TABLE zalo_settings
  ADD COLUMN IF NOT EXISTS auto_accept_friend_requests BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN zalo_settings.auto_accept_friend_requests IS
  'TRUE = nick Zalo ca nhan nay tu dong dong y loi moi ket ban den (toi da ZALO_AUTO_ACCEPT_PER_HOUR/gio, khong chay trong gio yen lang). Mac dinh FALSE.';
