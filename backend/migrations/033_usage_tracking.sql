-- Migration 031: Add Usage Tracking & Feature Flags
-- Purpose: Track resource usage and feature availability per user

BEGIN;

-- Usage logs table
CREATE TABLE IF NOT EXISTS usage_logs (
  id            BIGSERIAL PRIMARY KEY,
  id_user       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_type VARCHAR(50) NOT NULL, -- 'campaign', 'landing_page', 'email_sent', etc.
  delta         INTEGER NOT NULL DEFAULT 1,
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user ON usage_logs(id_user);
CREATE INDEX IF NOT EXISTS idx_usage_logs_resource ON usage_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_usage_logs_period ON usage_logs(period_start, period_end);

-- Add features column to plans table (if not exists)
ALTER TABLE plans ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]';

-- Add plan-specific features to default plans
UPDATE plans SET features = '["unified_inbox", "multi_language"]'::JSONB WHERE code = 'pro';
UPDATE plans SET features = '["multi_language"]'::JSONB WHERE code = 'basic';

COMMIT;
