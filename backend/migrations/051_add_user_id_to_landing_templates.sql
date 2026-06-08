-- Migration: Add user_id to landing_page_templates to track template creator
-- And add is_public column for visibility control

ALTER TABLE landing_page_templates ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE landing_page_templates ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_lp_templates_user ON landing_page_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_lp_templates_public ON landing_page_templates(is_public);
