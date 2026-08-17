-- Migration 143: storage retail topup pricing and custom plan 1000 GB capacity
BEGIN;

-- 1. Retail storage top-up pricing (PR-1)
INSERT INTO topup_pricing (item_key, unit_price, min_qty, step_qty, max_qty, is_active, sort_order)
VALUES ('storage_gb', 25000, 5, 5, 200, TRUE, 90)
ON CONFLICT (item_key) DO UPDATE SET
  unit_price = EXCLUDED.unit_price,
  min_qty    = EXCLUDED.min_qty,
  step_qty   = EXCLUDED.step_qty,
  max_qty    = EXCLUDED.max_qty,
  is_active  = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;

-- 2. Upgrade storage quota for default plans (PR-2)
UPDATE plans
SET storage_limit_bytes = CASE LOWER(COALESCE(code, ''))
  WHEN 'trial' THEN 209715200          -- 200 MB
  WHEN 'starter' THEN 2147483648       -- 2 GB
  WHEN 'basic' THEN 5368709120         -- 5 GB
  WHEN 'professional' THEN 16106127360 -- 15 GB
  WHEN 'enterprise' THEN 42949672960   -- 40 GB
  ELSE storage_limit_bytes
END
WHERE is_custom = FALSE OR is_custom IS NULL;

-- 3. Custom plan storage pricing, limits and step (PR-2)
INSERT INTO custom_plan_pricing
  (item_key, plan_column, unit_price, unit_size, included_qty, min_qty, max_qty, step_qty, is_active, sort_order)
VALUES
  ('storage_gb', 'storage_limit_bytes', 15000, 1, 10, 10, 1000, 10, TRUE, 160)
ON CONFLICT (item_key) DO UPDATE SET
  unit_price = EXCLUDED.unit_price,
  included_qty = EXCLUDED.included_qty,
  min_qty = EXCLUDED.min_qty,
  max_qty = EXCLUDED.max_qty,
  step_qty = EXCLUDED.step_qty,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;

COMMIT;
