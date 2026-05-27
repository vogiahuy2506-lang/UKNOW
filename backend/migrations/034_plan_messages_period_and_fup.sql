-- Migration 034: Add period-based message limits and FUP flag
-- Để hỗ trợ các gói có giới hạn theo "kỳ" (trial: 100 tin/kỳ 10 ngày)
-- và cờ FUP cho phép "không giới hạn thực tế" nhưng có fair usage policy

-- Giới hạn tin nhắn theo "kỳ" (period = duration_days)
-- NULL = không có giới hạn theo kỳ (dùng monthly_limit thông thường)
-- Giá trị > 0 = giới hạn cho toàn bộ kỳ subscription
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS messages_per_period INTEGER,
  ADD COLUMN IF NOT EXISTS is_fup_enabled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN plans.messages_per_period IS 'Giới hạn tin nhắn cho toàn bộ kỳ subscription (NULL = không giới hạn theo kỳ).';
COMMENT ON COLUMN plans.is_fup_enabled IS 'TRUE = gói "không giới hạn" nhưng có Fair Usage Policy. Admin sẽ thấy cảnh báo FUP.';

-- Sync sang users khi gán plan
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS messages_per_period INTEGER,
  ADD COLUMN IF NOT EXISTS is_fup_enabled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN users.messages_per_period IS 'Sync từ plans.messages_per_period khi gán gói.';
COMMENT ON COLUMN users.is_fup_enabled IS 'Sync từ plans.is_fup_enabled khi gán gói.';
