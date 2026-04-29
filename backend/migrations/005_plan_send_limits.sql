-- Migration 005: Add structured send limits to plans table
-- NULL = unlimited for all columns

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS daily_email_limit   INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS monthly_email_limit INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS daily_zalo_limit    INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS monthly_zalo_limit  INTEGER DEFAULT NULL;
