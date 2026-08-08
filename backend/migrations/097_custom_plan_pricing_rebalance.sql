-- Rebalance self-serve custom plan unit prices + included_qty baseline.
-- Migration 096 seeded with ON CONFLICT DO NOTHING — this must UPDATE existing rows.

UPDATE custom_plan_pricing SET
  unit_price = v.unit_price,
  unit_size = v.unit_size,
  included_qty = v.included_qty,
  min_qty = v.min_qty,
  step_qty = v.step_qty,
  updated_at = NOW()
FROM (VALUES
  ('zalo_messages',        30000,  500,  500,  500,  500),
  ('emails',               25000, 2500, 2500, 2500, 2500),
  ('ai_credits',           35000,  250,  250,  250,  250),
  ('zalo_accounts',        40000,    1,    1,    1,    1),
  ('email_accounts',       40000,    1,    1,    1,    1),
  ('landing_pages',        20000,    1,    1,    1,    1),
  ('chatbots',             70000,    1,    1,    1,    1),
  ('employees',            35000,    1,    1,    1,    1),
  ('campaigns',            10000,    1,    1,    1,    1),
  ('zalo_campaigns',       10000,    1,    0,    0,    1),
  ('zalo_group_campaigns', 10000,    1,    0,    0,    1),
  ('email_campaigns',      10000,    1,    0,    0,    1),
  ('email_templates',       8000,    1,    0,    0,    1),
  ('zalo_templates',        8000,    1,    0,    0,    1)
) AS v(item_key, unit_price, unit_size, included_qty, min_qty, step_qty)
WHERE custom_plan_pricing.item_key = v.item_key;
