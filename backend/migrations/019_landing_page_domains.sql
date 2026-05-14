-- Custom hostname (www.*) per published landing — TXT verify, optional apex redirect documented in ops.

CREATE TABLE IF NOT EXISTS landing_page_domains (
  id                BIGSERIAL PRIMARY KEY,
  landing_page_id   BIGINT NOT NULL REFERENCES landing_pages (id) ON DELETE CASCADE,
  hostname          TEXT NOT NULL,
  verification_token TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending_verification'
                      CHECK (status IN ('pending_verification', 'active', 'disabled')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at       TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_landing_page_domains_landing_page_id
  ON landing_page_domains (landing_page_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_landing_page_domains_hostname_lower
  ON landing_page_domains (LOWER(hostname));

CREATE INDEX IF NOT EXISTS idx_landing_page_domains_status_lower_host
  ON landing_page_domains (status, LOWER(hostname));

COMMENT ON TABLE landing_page_domains IS 'Một hostname www.* đã verify cho một landing CMS; apex redirect do nginx/Cloudflare.';
