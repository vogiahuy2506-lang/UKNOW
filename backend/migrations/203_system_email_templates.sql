-- Editable system-owned email templates. These templates are global and may
-- only be managed through super-admin routes.
CREATE TABLE IF NOT EXISTS system_email_templates (
  template_key VARCHAR(64) PRIMARY KEY,
  subject      TEXT        NOT NULL,
  body_html    TEXT        NOT NULL,
  updated_by   BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT system_email_templates_key_check CHECK (template_key = 'welcome')
);

