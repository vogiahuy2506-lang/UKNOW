-- 119: Help articles locale (EN translations) + stale flag
-- Each (slug, locale) is one row; chunks follow article_id.

ALTER TABLE help_articles
  ADD COLUMN IF NOT EXISTS locale VARCHAR(5) NOT NULL DEFAULT 'vi';

ALTER TABLE help_articles
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE help_articles
  ADD COLUMN IF NOT EXISTS source_locale VARCHAR(5);

ALTER TABLE help_articles
  ADD COLUMN IF NOT EXISTS translated_at TIMESTAMPTZ;

-- Drop single-column UNIQUE(slug) then add composite unique.
ALTER TABLE help_articles DROP CONSTRAINT IF EXISTS help_articles_slug_key;
ALTER TABLE help_articles DROP CONSTRAINT IF EXISTS help_articles_slug_locale_key;
ALTER TABLE help_articles ADD CONSTRAINT help_articles_slug_locale_key UNIQUE (slug, locale);

CREATE INDEX IF NOT EXISTS idx_help_articles_locale
  ON help_articles (locale, is_published);

COMMENT ON COLUMN help_articles.locale IS 'vi|en — bản dịch cùng slug, khác locale.';
COMMENT ON COLUMN help_articles.is_stale IS 'Bản dịch cần cập nhật sau khi sửa bản gốc.';
