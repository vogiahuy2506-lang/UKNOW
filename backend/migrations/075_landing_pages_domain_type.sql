-- Add domain_type and domain_subtype columns to landing_pages for easy querying.
-- domain_type: 'system' (auto-provisioned subdomain) or 'custom' (user-configured)
-- domain_subtype: 'subdomain' or 'apex' (only for custom domains)

ALTER TABLE landing_pages
  ADD COLUMN domain_type VARCHAR(20) NOT NULL DEFAULT 'system'
    CHECK (domain_type IN ('system', 'custom')),
  ADD COLUMN domain_subtype VARCHAR(20) DEFAULT NULL
    CHECK (domain_subtype IS NULL OR domain_subtype IN ('subdomain', 'apex'));

COMMENT ON COLUMN landing_pages.domain_type IS
  'system: auto-provisioned subdomain (slug.founderai.biz). custom: user-configured domain.';
COMMENT ON COLUMN landing_pages.domain_subtype IS
  'subdomain (CNAME) or apex (A record), only set when domain_type=custom.';

-- Migrate existing data: set domain_type='system' for all rows (existing LPs use system domain)
-- Custom domain info is in landing_page_domains table, this column is for quick access
UPDATE landing_pages SET domain_type = 'system', domain_subtype = NULL WHERE domain_type = 'system';

-- Backfill for landing pages that have a custom domain in landing_page_domains
UPDATE landing_pages lp
SET
  domain_type = 'custom',
  domain_subtype = CASE
    WHEN ld.is_apex_domain = TRUE THEN 'apex'
    ELSE 'subdomain'
  END
FROM landing_page_domains ld
WHERE ld.landing_page_id = lp.id
  AND ld.status IN ('pending_verification', 'active');
