-- Migration 125: compatibility — landing_pages.custom_config
-- Production already has this from 018; integration bootstrap historically omitted it.

ALTER TABLE landing_pages
  ADD COLUMN IF NOT EXISTS custom_config JSONB NOT NULL DEFAULT '{}'::jsonb;
