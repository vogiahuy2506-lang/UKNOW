-- Migration: 069_email_settings_platform_prefix.sql
-- Add platform_prefix column to allow users to customize the email prefix for platform mode
-- Instead of always using "no-reply@domain", users can set custom prefixes like "123@domain", "support@domain", etc.

BEGIN;

-- Add platform_prefix column with default value for backward compatibility
ALTER TABLE email_settings
ADD COLUMN IF NOT EXISTS platform_prefix VARCHAR(50) DEFAULT 'no-reply';

-- Update existing records to have 'no-reply' as their prefix (backward compatibility)
UPDATE email_settings
SET platform_prefix = 'no-reply'
WHERE platform_prefix IS NULL;

-- Make the column NOT NULL now that all existing records have a value
ALTER TABLE email_settings
ALTER COLUMN platform_prefix SET NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN email_settings.platform_prefix IS 'Email prefix for platform mode (e.g., no-reply, support, 123). Combined with DEFAULT_FROM_DOMAIN to form the full sender email.';

COMMIT;
