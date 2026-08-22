-- Migration 166: Employee AI credit limits and Campaign Approval Threshold

ALTER TABLE user_members
  ADD COLUMN IF NOT EXISTS daily_ai_credit_limit INTEGER,
  ADD COLUMN IF NOT EXISTS period_ai_credit_limit INTEGER;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employee_campaign_approval_threshold INTEGER;
