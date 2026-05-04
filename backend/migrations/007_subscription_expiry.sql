-- Migration 007: Subscription expiry tracking
-- Theo dõi ngày hết hạn gói và số lần nhắc nhở đã gửi cho mỗi user_admin.
-- NULL = chưa có gói hoặc gói không có thời hạn.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_expires_at  TIMESTAMPTZ  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subscription_reminder_count SMALLINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_subscription_expires
  ON users (subscription_expires_at)
  WHERE subscription_expires_at IS NOT NULL;

COMMIT;
