-- Migration 015: Bảng lưu form liên hệ từ trang /contact
-- Public form không cần auth, lưu lead vào DB để admin theo dõi.

BEGIN;

CREATE TABLE IF NOT EXISTS contact_submissions (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  email       VARCHAR(255) NOT NULL,
  phone       VARCHAR(50),
  company     VARCHAR(255),
  company_size VARCHAR(50),
  message     TEXT,
  status      VARCHAR(50) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'closed')),
  notes       TEXT,
  ip_address  VARCHAR(50),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_status_created
  ON contact_submissions(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_email
  ON contact_submissions(email);

COMMIT;
