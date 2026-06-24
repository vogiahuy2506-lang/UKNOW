-- Add is_apex_domain column to let users explicitly choose apex vs subdomain.
-- This replaces the heuristic auto-detection in the service.

ALTER TABLE landing_page_domains
  ADD COLUMN IF NOT EXISTS is_apex_domain BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN landing_page_domains.is_apex_domain IS
  'TRUE if the user explicitly chose apex domain (e.g. mysite.com). '
  'FALSE if subdomain (e.g. www.mysite.com or lp.mysite.com).';
