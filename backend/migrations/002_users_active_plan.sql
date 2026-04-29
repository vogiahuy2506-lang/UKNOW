-- Migration 002: Add active_plan_id to users
-- Description: Track user's current active plan directly on users table.
--              NULL = no plan (new user_admin or superadmin).
--              Updated by webhook handler when payment is confirmed.

BEGIN;

ALTER TABLE users
  ADD COLUMN active_plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL;

-- Backfill từ order success gần nhất của mỗi user
UPDATE users u
  SET active_plan_id = o.plan_id
  FROM (
    SELECT DISTINCT ON (user_id) user_id, plan_id
    FROM orders
    WHERE status = 'success' AND user_id IS NOT NULL
    ORDER BY user_id, created_at DESC
  ) o
  WHERE u.id = o.user_id;

CREATE INDEX idx_users_active_plan ON users(active_plan_id);

COMMIT;
