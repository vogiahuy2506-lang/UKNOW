-- Migration: Create landing_page_sections table for HTML/CSS overrides
-- This table stores custom HTML/CSS content per page section

CREATE TABLE IF NOT EXISTS landing_page_sections (
  id SERIAL PRIMARY KEY,
  page VARCHAR(50) NOT NULL,
  section VARCHAR(50) NOT NULL,
  html_content TEXT,
  css_content TEXT,
  config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(page, section)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_landing_sections_page ON landing_page_sections(page);
CREATE INDEX IF NOT EXISTS idx_landing_sections_page_section ON landing_page_sections(page, section);

-- Add comment for documentation
COMMENT ON TABLE landing_page_sections IS 'Stores HTML/CSS customizations for landing page sections';
COMMENT ON COLUMN landing_page_sections.page IS 'Page identifier: hero, contact, pricing';
COMMENT ON COLUMN landing_page_sections.section IS 'Section identifier within page: hero_content, features, stats, etc.';
COMMENT ON COLUMN landing_page_sections.html_content IS 'Custom HTML content for the section';
COMMENT ON COLUMN landing_page_sections.css_content IS 'Custom CSS styles for the section';
COMMENT ON COLUMN landing_page_sections.config IS 'Additional configuration as JSON (colors, spacing, etc.)';
