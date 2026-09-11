-- PR-1 (Xác thực SĐT bằng OTP) — nền cho verification_codes theo SĐT + cột đánh dấu SĐT
-- đã xác thực trên users. Xem _internal/PLAN_XAC_THUC_SDT_OTP_2026-09-11.md mục 4.
--
-- verification_codes trước đây chỉ phục vụ email (cột `email NOT NULL`). Thêm `phone`/
-- `user_id`/`attempts` để dùng lại đúng bảng cho OTP SĐT, tách khỏi nhánh LOWER(email) —
-- không tái dùng cột email chứa SĐT (Bẫy #1 trong plan: cooldown/LOWER(email) sẽ trộn hai
-- luồng nếu dùng chung cột).
ALTER TABLE verification_codes
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS user_id BIGINT,
  ADD COLUMN IF NOT EXISTS attempts SMALLINT NOT NULL DEFAULT 0;

-- Nới NOT NULL trên email — mã OTP theo SĐT không có địa chỉ email đi kèm. Đây là ALTER
-- COLUMN ... DROP NOT NULL (nới ràng buộc), không phải SET NOT NULL — không dính chốt B3
-- của checkMigrationSafety.util.js (chỉ chặn SET NOT NULL trực tiếp trên cột có sẵn).
ALTER TABLE verification_codes
  ALTER COLUMN email DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_verification_codes_phone
  ON verification_codes (phone, type, created_at DESC);

-- Mốc SĐT được xác thực bằng OTP — NULL nghĩa là chưa xác thực (kể cả tài khoản cũ đã có
-- `phone` từ trước khi tính năng này tồn tại, coi như chưa xác thực — mục 3.4 trong plan).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;
