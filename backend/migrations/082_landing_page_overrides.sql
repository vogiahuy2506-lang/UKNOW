-- Drop existing table if it exists with wrong schema
DROP TABLE IF EXISTS landing_page_overrides;

-- Landing Page Overrides Table
-- Allows superadmin to customize landing page content without code changes

CREATE TABLE landing_page_overrides (
  id SERIAL PRIMARY KEY,
  page VARCHAR(50) NOT NULL CHECK (page IN ('hero', 'contact', 'pricing')),
  section VARCHAR(100) NOT NULL,
  key VARCHAR(100) NOT NULL,
  value_vi TEXT,
  value_en TEXT,
  extra_data JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(page, section, key)
);

-- Index for fast lookups by page
CREATE INDEX idx_landing_overrides_page ON landing_page_overrides(page);
CREATE INDEX idx_landing_overrides_active ON landing_page_overrides(is_active);

-- Comments
COMMENT ON TABLE landing_page_overrides IS 'Stores customizable content overrides for landing pages';
COMMENT ON COLUMN landing_page_overrides.page IS 'Page identifier: hero, contact, pricing';
COMMENT ON COLUMN landing_page_overrides.section IS 'Section within page: stats, features, contact_info, etc.';
COMMENT ON COLUMN landing_page_overrides.key IS 'Specific key within section: businesses, email, title, etc.';
COMMENT ON COLUMN landing_page_overrides.value_vi IS 'Vietnamese content override';
COMMENT ON COLUMN landing_page_overrides.value_en IS 'English content override';
COMMENT ON COLUMN landing_page_overrides.extra_data IS 'JSON data for complex overrides: colors, icons, etc.';
