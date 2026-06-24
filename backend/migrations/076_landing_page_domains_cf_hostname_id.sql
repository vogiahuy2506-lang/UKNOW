-- Add cf_hostname_id column (reserved for future use, currently unused but schema prepared)
-- This column can be used for external SSL provider integration if needed

ALTER TABLE landing_page_domains
  ADD COLUMN IF NOT EXISTS cf_hostname_id VARCHAR(100) DEFAULT NULL;

COMMENT ON COLUMN landing_page_domains.cf_hostname_id IS
  'Reserved: External SSL provider hostname ID (e.g., Cloudflare SaaS). Currently unused - all SSL via Certbot.';
