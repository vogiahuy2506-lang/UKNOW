-- Migration: Custom Domain Management
-- Allows users to host landing pages on their own domains

-- 1. Custom Domains Table
-- IF NOT EXISTS: DB có thể đã có bảng từ migration cũ 019_custom_domains.sql (đổi tên file → 020).
CREATE TABLE IF NOT EXISTS custom_domains (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  landing_page_id BIGINT REFERENCES landing_pages(id) ON DELETE SET NULL,
  domain VARCHAR(255) NOT NULL,
  subdomain VARCHAR(128),
  status VARCHAR(30) DEFAULT 'pending', -- pending, verifying, active, failed, suspended
  verification_status VARCHAR(20) DEFAULT 'pending', -- pending, in_progress, verified, failed
  verification_token VARCHAR(255), -- TXT record value for verification
  verification_method VARCHAR(20) DEFAULT 'txt', -- txt, cname, http
  ssl_status VARCHAR(20) DEFAULT 'pending', -- pending, provisioning, active, expired, failed
  ssl_cert_arn VARCHAR(255), -- AWS ACM certificate ARN
  ssl_expires_at TIMESTAMPTZ,
  dns_config JSONB DEFAULT '{}', -- Store DNS records to be created
  cname_target VARCHAR(255), -- e.g., lp.uknow.vn or cname.verceldns.com
  is_primary BOOLEAN DEFAULT true, -- Primary domain vs subdomain
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  error_message TEXT,
  last_checked_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_domain UNIQUE (user_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_custom_domains_user ON custom_domains(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_domains_domain ON custom_domains(domain);
CREATE INDEX IF NOT EXISTS idx_custom_domains_status ON custom_domains(status);
CREATE INDEX IF NOT EXISTS idx_custom_domains_landing_page ON custom_domains(landing_page_id);

-- 2. Domain Verification History (for audit)
CREATE TABLE IF NOT EXISTS custom_domain_verifications (
  id SERIAL PRIMARY KEY,
  domain_id BIGINT NOT NULL REFERENCES custom_domains(id) ON DELETE CASCADE,
  verification_type VARCHAR(20) NOT NULL, -- txt, cname, http
  verification_token VARCHAR(255),
  status VARCHAR(20) NOT NULL, -- pending, success, failed
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  response_data JSONB -- Store DNS lookup results or HTTP response
);

CREATE INDEX IF NOT EXISTS idx_domain_verifications_domain ON custom_domain_verifications(domain_id);

-- 3. Domain SSL Certificates tracking
CREATE TABLE IF NOT EXISTS custom_domain_ssl (
  id SERIAL PRIMARY KEY,
  domain_id BIGINT NOT NULL REFERENCES custom_domains(id) ON DELETE CASCADE,
  cert_arn VARCHAR(255),
  cert_type VARCHAR(20) DEFAULT 'letsencrypt', -- letsencrypt, aws_acm, manual
  status VARCHAR(20) DEFAULT 'pending', -- pending, active, expired, revoked
  issued_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domain_ssl_domain ON custom_domain_ssl(domain_id);

-- 4. Add foreign key to landing_pages for custom domain reference
-- This allows us to know which custom domain is serving which landing page
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS custom_domain_id INTEGER REFERENCES custom_domains(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_landing_pages_custom_domain ON landing_pages(custom_domain_id);
