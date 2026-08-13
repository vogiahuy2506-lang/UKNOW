-- Migration: 121_email_settings_ensure_columns.sql
-- Ensure all required columns exist in email_settings table

BEGIN;

-- Add platform_prefix column if it doesn't exist
ALTER TABLE email_settings
ADD COLUMN IF NOT EXISTS platform_prefix VARCHAR(50) DEFAULT 'no-reply';

-- Add email_mode column if it doesn't exist
ALTER TABLE email_settings
ADD COLUMN IF NOT EXISTS email_mode TEXT DEFAULT 'platform';

-- Update existing NULL values to defaults
UPDATE email_settings SET platform_prefix = 'no-reply' WHERE platform_prefix IS NULL;
UPDATE email_settings SET email_mode = 'platform' WHERE email_mode IS NULL;

-- Set NOT NULL constraints now that all records have values
ALTER TABLE email_settings ALTER COLUMN platform_prefix SET NOT NULL;
ALTER TABLE email_settings ALTER COLUMN email_mode SET NOT NULL;

COMMIT;
