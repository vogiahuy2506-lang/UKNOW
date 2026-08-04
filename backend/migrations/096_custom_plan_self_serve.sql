-- Migration 096: Self-serve custom plans
-- 1) Ownership + config snapshot on plans
-- 2) Admin-managed unit pricing table with seed from Task-2 pricing report

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS custom_owner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS custom_config JSONB;

CREATE INDEX IF NOT EXISTS idx_plans_custom_owner
  ON plans (custom_owner_user_id)
  WHERE is_custom = TRUE AND custom_owner_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS custom_plan_pricing (
  id           BIGSERIAL PRIMARY KEY,
  item_key     VARCHAR(50) UNIQUE NOT NULL,
  plan_column  VARCHAR(50),
  unit_price   BIGINT  NOT NULL DEFAULT 0,
  unit_size    INTEGER NOT NULL DEFAULT 1,
  included_qty INTEGER NOT NULL DEFAULT 0,
  min_qty      INTEGER NOT NULL DEFAULT 0,
  max_qty      INTEGER,
  step_qty     INTEGER NOT NULL DEFAULT 1,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT custom_plan_pricing_unit_size_positive CHECK (unit_size > 0),
  CONSTRAINT custom_plan_pricing_step_qty_positive CHECK (step_qty > 0),
  CONSTRAINT custom_plan_pricing_min_qty_nonneg CHECK (min_qty >= 0)
);

-- Business config rows (unit_price stores the config value)
INSERT INTO custom_plan_pricing (item_key, plan_column, unit_price, unit_size, included_qty, min_qty, max_qty, step_qty, is_active, sort_order)
VALUES
  ('yearly_discount_percent',          NULL, 20,    1, 0, 0, NULL, 1, TRUE, 0),
  ('zalo_monthly_capacity_per_account', NULL, 16000, 1, 0, 0, NULL, 1, TRUE, 0)
ON CONFLICT (item_key) DO NOTHING;

-- Billable items (Task-2 §3.1 + §3.2)
INSERT INTO custom_plan_pricing (item_key, plan_column, unit_price, unit_size, included_qty, min_qty, max_qty, step_qty, is_active, sort_order)
VALUES
  ('base_fee',              NULL,                        199000, 1,    0, 1, 1,       1,    TRUE, 10),
  ('zalo_messages',         'monthly_zalo_limit',        100000, 1000, 0, 0, 200000,  1000, TRUE, 20),
  ('emails',                'monthly_email_limit',       100000, 5000, 0, 0, 500000,  5000, TRUE, 30),
  ('ai_credits',            'ai_credits_per_period',     100000, 500,  0, 0, 50000,   500,  TRUE, 40),
  ('zalo_accounts',         'max_zalo_accounts',          50000, 1,    0, 1, 50,      1,    TRUE, 50),
  ('email_accounts',        'max_email_accounts',         50000, 1,    0, 1, 50,      1,    TRUE, 60),
  ('landing_pages',         'max_landing_pages',          30000, 1,    0, 1, 200,     1,    TRUE, 70),
  ('chatbots',              'max_chatbots',              100000, 1,    0, 1, 100,     1,    TRUE, 80),
  ('employees',             'max_employees',              50000, 1,    0, 1, 100,     1,    TRUE, 90),
  ('campaigns',             'max_campaigns',              20000, 1,    0, 1, 500,     1,    TRUE, 100),
  ('zalo_campaigns',        'max_zalo_campaigns',         20000, 1,    0, 0, 200,     1,    TRUE, 110),
  ('zalo_group_campaigns',  'max_zalo_group_campaigns',   20000, 1,    0, 0, 200,     1,    TRUE, 120),
  ('email_campaigns',       'max_email_campaigns',        20000, 1,    0, 0, 200,     1,    TRUE, 130),
  ('email_templates',       'max_email_templates',        10000, 1,    0, 0, 500,     1,    TRUE, 140),
  ('zalo_templates',        'max_zalo_templates',         10000, 1,    0, 0, 500,     1,    TRUE, 150)
ON CONFLICT (item_key) DO NOTHING;
