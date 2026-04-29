-- Migration 004: Employee send limits
-- Add per-employee daily and monthly send limits for email and zalo.
-- NULL = unlimited (user_admin's choice).

BEGIN;

ALTER TABLE user_members
  ADD COLUMN daily_email_limit   INTEGER DEFAULT NULL CHECK (daily_email_limit IS NULL OR daily_email_limit >= 0),
  ADD COLUMN monthly_email_limit INTEGER DEFAULT NULL CHECK (monthly_email_limit IS NULL OR monthly_email_limit >= 0),
  ADD COLUMN daily_zalo_limit    INTEGER DEFAULT NULL CHECK (daily_zalo_limit IS NULL OR daily_zalo_limit >= 0),
  ADD COLUMN monthly_zalo_limit  INTEGER DEFAULT NULL CHECK (monthly_zalo_limit IS NULL OR monthly_zalo_limit >= 0);

COMMIT;
