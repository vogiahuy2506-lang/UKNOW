-- Migration 138: seed storage_gb into custom_plan_pricing for self-serve custom plan builder
BEGIN;

INSERT INTO custom_plan_pricing
  (item_key, plan_column, unit_price, unit_size, included_qty, min_qty, max_qty, step_qty, is_active, sort_order)
VALUES
  ('storage_gb', 'storage_limit_bytes', 30000, 1, 1, 1, 20, 1, TRUE, 160)
ON CONFLICT (item_key) DO NOTHING;

COMMIT;
