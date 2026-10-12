-- PLAN_MOC_NHAC_HAN_THEO_KY_2026-10-12.md, B1 - gói năm phải được nhắc hạn trước ít nhất 30 ngày.
-- Mốc nhắc tách theo KỲ của gói: cột cũ days_before giữ nguyên tên và nghĩa (= mốc cho gói tháng, API cũ
-- `daysBefore` không đổi), cột mới days_before_yearly = mốc cho gói năm (kỳ >= 300 ngày, xem
-- YEARLY_CYCLE_MIN_DAYS ở subscription.repository.js).
--
-- Không cần allow-destructive-ddl: chỉ thêm cột mới (DEFAULT hằng số nên không khoá bảng lâu), không DROP/RENAME/SET NOT NULL.
-- Bảng một dòng (id BOOLEAN PK) đã có sẵn dòng seed từ migration 207 -> ADD COLUMN ... DEFAULT tự điền '{30,7,3}' cho dòng đó.

ALTER TABLE subscription_reminder_settings
  ADD COLUMN IF NOT EXISTS days_before_yearly INTEGER[] NOT NULL DEFAULT '{30,7,3}';
