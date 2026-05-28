-- Migration 035: Add period-based message quota and FUP flag to plans/users.
-- Safe migration only: does not seed, delete, or overwrite existing plans.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS messages_per_period INTEGER,
  ADD COLUMN IF NOT EXISTS is_fup_enabled BOOLEAN DEFAULT FALSE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS messages_per_period INTEGER,
  ADD COLUMN IF NOT EXISTS is_fup_enabled BOOLEAN DEFAULT FALSE;

ALTER TABLE plans
  DROP CONSTRAINT IF EXISTS plans_messages_per_period_check,
  ADD CONSTRAINT plans_messages_per_period_check
    CHECK (messages_per_period IS NULL OR messages_per_period >= 0);

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_messages_per_period_check,
  ADD CONSTRAINT users_messages_per_period_check
    CHECK (messages_per_period IS NULL OR messages_per_period >= 0);

COMMENT ON COLUMN plans.messages_per_period IS 'Total message quota for the plan billing period. NULL means unlimited.';
COMMENT ON COLUMN plans.is_fup_enabled IS 'Whether Fair Usage Policy applies after the period message quota.';
COMMENT ON COLUMN users.messages_per_period IS 'Snapshot of active plan period message quota.';
COMMENT ON COLUMN users.is_fup_enabled IS 'Snapshot of active plan Fair Usage Policy flag.';
