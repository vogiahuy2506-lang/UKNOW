-- Migration 066: Add reply_to and brand_domain to email_messages
-- These columns track the actual "from" used at send time and the Reply-To address,
-- enabling better debugging and analytics on email sending behavior.

-- Actual from address used (e.g. "no-reply@founderai.biz" or "no-reply@uef.edu.vn")
ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS from_address VARCHAR(255);

-- Reply-To address (defaults to email_settings.email if not set)
ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS reply_to VARCHAR(255);

-- Brand domain used for the from address (e.g. "founderai.biz", "uef.edu.vn")
ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS brand_domain VARCHAR(255);

-- Index for analytics: query by brand_domain to see send stats per domain
CREATE INDEX IF NOT EXISTS idx_email_messages_brand_domain
  ON email_messages(brand_domain)
  WHERE brand_domain IS NOT NULL;

COMMENT ON COLUMN email_messages.from_address IS
  'Actual "from" address used at send time (e.g. no-reply@founderai.biz). May differ from sender_email.';

COMMENT ON COLUMN email_messages.reply_to IS
  'Reply-To address used for this email. From email_settings.reply_to, defaults to sender_email.';

COMMENT ON COLUMN email_messages.brand_domain IS
  'Domain part of from_address used (e.g. founderai.biz). Used for send analytics by domain.';
