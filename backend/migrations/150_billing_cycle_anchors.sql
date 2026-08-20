-- Migration 150: Thêm plan_activated_at vào users để làm anchor cho chu kỳ hạn mức 30 ngày đếm xuôi.
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_activated_at TIMESTAMPTZ;

-- Backfill cho user đã có gói đang active:
UPDATE users u
SET plan_activated_at = CASE
  WHEN u.subscription_expires_at IS NOT NULL AND p.duration_days IS NOT NULL THEN
    u.subscription_expires_at - (p.duration_days || ' days')::INTERVAL
  WHEN u.subscription_expires_at IS NOT NULL THEN
    u.subscription_expires_at - INTERVAL '30 days'
  ELSE u.created_at
END
FROM plans p
WHERE u.active_plan_id = p.id
  AND u.plan_activated_at IS NULL;
