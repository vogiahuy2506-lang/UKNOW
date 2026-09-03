-- Migration 179: SĐT chỉ được dùng cho 1 tài khoản.
-- Dữ liệu cũ PHẢI được chuẩn hoá TRƯỚC bằng scripts/normalizeUserPhones.js --apply
-- (dùng normalizePhoneForZaloCampaign — cùng hàm ứng dụng sẽ dùng để chuẩn hoá SĐT mới).
-- Không tự viết SQL chuẩn hoá ở đây — xem PLAN_SDT_BAT_BUOC_SYNC_SHEET_2026-09-02.md
-- mục 1.1 và Bẫy #1: SQL viết tay từng lệch hàm JS, để lại số trùng lọt qua UNIQUE.

-- Partial unique: NULL vẫn được phép (user cũ chưa nhập), số đã nhập thì không trùng.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users (phone) WHERE phone IS NOT NULL;
