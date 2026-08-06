-- PLAN_ZALO_MOT_WORKSPACE Z-3
-- Mỗi số Zalo chỉ có MỘT kết nối còn sống trên toàn hệ thống.
--
-- ⚠️ CHỈ CHẠY SAU KHI Z-1 XÁC NHẬN KHÔNG CÒN TRÙNG TRÊN PRODUCTION:
--   SELECT zalo_user_id, COUNT(DISTINCT id_user)
--   FROM zalo_settings
--   WHERE zalo_user_id IS NOT NULL AND is_active = TRUE AND status = 'connected'
--   GROUP BY zalo_user_id HAVING COUNT(DISTINCT id_user) > 1;
-- Còn trùng mà chạy → migration FAIL giữa danh sách.
--
-- Partial index: kết nối đã ngắt / tắt không tính → khách chuyển workspace được.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_zalo_settings_live_zalo_user
  ON zalo_settings (zalo_user_id)
  WHERE zalo_user_id IS NOT NULL
    AND is_active = TRUE
    AND status = 'connected';
