-- Migration 102: help_articles.body_html for rich-text editor (keep body_md for seed Markdown)

BEGIN;

ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS body_html TEXT;

COMMIT;
