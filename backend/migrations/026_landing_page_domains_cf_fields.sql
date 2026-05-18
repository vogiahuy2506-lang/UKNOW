-- Cloudflare-managed DNS fields for landing_page_domains.
-- cf_managed: true when Cloudflare API created the CNAME record automatically.
-- cf_zone_id / cf_record_id: stored for cleanup on domain removal.

ALTER TABLE landing_page_domains
  ADD COLUMN IF NOT EXISTS cf_managed   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cf_zone_id   TEXT,
  ADD COLUMN IF NOT EXISTS cf_record_id TEXT;

COMMENT ON COLUMN landing_page_domains.cf_managed   IS 'TRUE nếu backend tự tạo CNAME qua Cloudflare API';
COMMENT ON COLUMN landing_page_domains.cf_zone_id   IS 'Cloudflare Zone ID để cleanup khi xóa domain';
COMMENT ON COLUMN landing_page_domains.cf_record_id IS 'Cloudflare DNS record ID để cleanup khi xóa domain';
