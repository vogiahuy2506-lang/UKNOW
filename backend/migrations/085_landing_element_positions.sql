-- Migration: Add extra_data column to landing_page_overrides for storing element positions
-- This allows storing element positions (top, left, width, height, z_index, visible) in the existing overrides table

ALTER TABLE landing_page_overrides
ADD COLUMN IF NOT EXISTS extra_data JSONB DEFAULT '{}';

-- Update existing extra_data comments
COMMENT ON COLUMN landing_page_overrides.extra_data IS 'JSON data for complex overrides: colors, icons, positions (top, left, width, height, z_index, visible), styles';
