-- Migration 113: owner-configurable daily bot reply cap
-- NULL = no owner cap (system limits only). Must be > 0 when set.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bot_daily_reply_cap INTEGER;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_bot_daily_reply_cap_positive;

ALTER TABLE users
  ADD CONSTRAINT users_bot_daily_reply_cap_positive CHECK (
    bot_daily_reply_cap IS NULL OR bot_daily_reply_cap > 0
  );

COMMENT ON COLUMN users.bot_daily_reply_cap IS
  'Chủ tài khoản tự đặt trần lượt bot trả lời mỗi ngày. NULL = không đặt, chỉ theo hạn hệ thống.';

COMMIT;
