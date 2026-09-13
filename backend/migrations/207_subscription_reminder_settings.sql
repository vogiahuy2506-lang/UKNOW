-- PLAN_CAU_HINH_LICH_NHAC_HAN_2026-09-13.md, mục 3.1 — super admin tự đặt lịch nhắc hạn gói.
-- Không cần allow-destructive-ddl: chỉ thêm bảng mới + thêm cột mới, không DROP/RENAME/SET NOT
-- NULL trên cột có sẵn.

-- 1. Bảng cấu hình, ép đúng MỘT dòng bằng khoá boolean + CHECK.
CREATE TABLE IF NOT EXISTS subscription_reminder_settings (
  id          BOOLEAN     PRIMARY KEY DEFAULT TRUE CHECK (id),
  days_before INTEGER[]   NOT NULL DEFAULT '{7,3}',
  updated_by  BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO subscription_reminder_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

-- 2. Ghi nhớ ĐÃ GỬI MỐC NÀO trong chu kỳ hiện tại (thay cho đếm số lần) — xem mục 1.3/3.2 của
-- plan: đếm số lần gửi (subscription_reminder_count) hỏng ngay khi danh sách mốc thay đổi, vì nó
-- không biết mốc NÀO đã gửi, chỉ biết đã gửi MẤY lần. Cột này ghi {cycle, days}: cycle khác
-- subscription_expires_at hiện tại thì coi bản ghi cũ là rỗng (khách vừa gia hạn/đổi gói) — tự
-- dọn, không cần cron dọn dẹp riêng.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_reminders_sent JSONB NOT NULL DEFAULT '{}'::jsonb;
