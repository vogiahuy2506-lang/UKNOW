-- Migration 148: Add custom_plan_config to orders table
-- Allows storing pending custom plan configuration until payment fulfillment
ALTER TABLE orders ADD COLUMN IF NOT EXISTS custom_plan_config JSONB;
