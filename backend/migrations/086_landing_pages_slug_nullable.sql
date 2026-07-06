-- Migration: Allow slug to be NULL on landing_pages.
-- Slug no longer required: user can create a landing with only a title,
-- then later add slug (for free subdomain) and/or custom hostname.
-- Backend resolver routes by custom hostname; backup URL /lp/<slug> is unavailable
-- while slug is NULL but a custom domain is enough to serve the page.

ALTER TABLE landing_pages ALTER COLUMN slug DROP NOT NULL;

-- Replace exact unique index with a partial unique index that ignores NULLs
-- (allows multiple LPs without slug, but enforces uniqueness when slug is set).
DROP INDEX IF EXISTS idx_landing_pages_slug;
CREATE UNIQUE INDEX IF NOT EXISTS uq_landing_pages_slug
  ON landing_pages(slug)
  WHERE slug IS NOT NULL;
