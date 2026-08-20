-- Migration 151: Add overage_grace_until to users for 7-day resource lock grace period upon downgrade
ALTER TABLE users ADD COLUMN IF NOT EXISTS overage_grace_until TIMESTAMPTZ;
