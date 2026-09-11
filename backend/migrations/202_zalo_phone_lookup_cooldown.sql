-- PR-2b: cooldown tra số điện thoại Zalo phải sống sót qua deploy — hiện đang chỉ nằm
-- trong một Map của tiến trình Node (zaloRateLimiter.js), mất trắng mỗi lần container
-- bị thay mới. PR-2 vừa đổi cooldown từ 3 giờ cố định sang "tới 00:00 giờ VN" (có thể
-- dài tới 24 giờ) nên khoảng hở này càng đáng kể.
--
-- PHẢI là TIMESTAMPTZ, không phải TIMESTAMP — bảng này đã từng dính bẫy múi giờ (xem
-- last_connected_at): cột naive lưu giờ UTC trần trong khi so sánh/đọc lại theo giờ VN
-- sẽ lệch 7 tiếng, làm cooldown vô dụng.
ALTER TABLE zalo_settings
  ADD COLUMN IF NOT EXISTS phone_lookup_cooldown_until TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_zalo_settings_phone_lookup_cooldown
  ON zalo_settings (phone_lookup_cooldown_until)
  WHERE phone_lookup_cooldown_until IS NOT NULL;
