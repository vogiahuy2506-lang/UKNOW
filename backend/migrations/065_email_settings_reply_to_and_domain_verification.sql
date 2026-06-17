-- Migration 065: Email settings - reply_to, domain verification, and forced platform from-address
-- Adds reply_to column so customer emails appear as replies to the real customer address.
-- Adds domain_verification fields for SendGrid domain authentication flow.
-- Note: the "from" address is now forced to @founderai.biz at send time;
--       email_settings.email becomes the "brand domain" used to route reply-to,
--       and reply_to is the explicit Reply-To address the customer will see.

-- 1. reply_to: explicit Reply-To address stored per setting
ALTER TABLE email_settings
  ADD COLUMN IF NOT EXISTS reply_to VARCHAR(255);

-- 2. Domain verification status for SendGrid domain authentication
--    pending | dns_records_created | verifying | verified | failed
ALTER TABLE email_settings
  ADD COLUMN IF NOT EXISTS domain_verification_status VARCHAR(30)
    NOT NULL DEFAULT 'not_required';

-- 3. The domain extracted from email_settings.email (e.g. "founderai.biz")
--    Stored here so we don't re-parse every time and can index it.
ALTER TABLE email_settings
  ADD COLUMN IF NOT EXISTS brand_domain VARCHAR(255);

-- 4. DNS records returned by SendGrid (stored so customers can see what to copy)
--    JSONB: { spf_record, dkim_record, dkim_cname_target }
ALTER TABLE email_settings
  ADD COLUMN IF NOT EXISTS domain_dns_records JSONB;

-- 5. Timestamp when SendGrid verification was completed
ALTER TABLE email_settings
  ADD COLUMN IF NOT EXISTS domain_verified_at TIMESTAMPTZ;

-- Index for fast domain lookup
CREATE INDEX IF NOT EXISTS idx_email_settings_brand_domain
  ON email_settings(brand_domain)
  WHERE brand_domain IS NOT NULL;

-- Migrate existing records: extract domain from email, set reply_to = email for backward compat
UPDATE email_settings
SET
  reply_to = email,
  brand_domain = LOWER(SPLIT_PART(email, '@', 2)),
  domain_verification_status = 'not_required'
WHERE brand_domain IS NULL;

-- Add NOT NULL constraint after migration
ALTER TABLE email_settings
  ALTER COLUMN domain_verification_status SET NOT NULL;

COMMENT ON COLUMN email_settings.reply_to IS
  'Reply-To address shown to email recipients. Defaults to email column if not set.';

COMMENT ON COLUMN email_settings.domain_verification_status IS
  'SendGrid domain authentication status: not_required | pending | dns_records_created | verifying | verified | failed';

COMMENT ON COLUMN email_settings.brand_domain IS
  'Domain extracted from email column (e.g. founderai.biz), used for routing and verification.';

COMMENT ON COLUMN email_settings.domain_dns_records IS
  'DNS records returned by SendGrid for domain authentication (SPF, DKIM CNAME targets).';

COMMENT ON COLUMN email_settings.domain_verified_at IS
  'Timestamp when SendGrid domain verification succeeded.';
