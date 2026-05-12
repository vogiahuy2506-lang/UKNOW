-- Migration: Add id_user for multi-tenancy in Landing Page features
-- Adds id_user to tables that were previously global.

-- 1. landing_featured_courses
ALTER TABLE landing_featured_courses ADD COLUMN IF NOT EXISTS id_user BIGINT;
-- Set existing records to a default user (e.g., ID 1) if necessary, 
-- or leave as NULL if they should be system-wide (though user said they are synced/global now).
UPDATE landing_featured_courses SET id_user = 1 WHERE id_user IS NULL;
ALTER TABLE landing_featured_courses ALTER COLUMN id_user SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_landing_featured_courses_user ON landing_featured_courses(id_user);

-- 2. landing_testimonials
ALTER TABLE landing_testimonials ADD COLUMN IF NOT EXISTS id_user BIGINT;
UPDATE landing_testimonials SET id_user = 1 WHERE id_user IS NULL;
ALTER TABLE landing_testimonials ALTER COLUMN id_user SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_landing_testimonials_user ON landing_testimonials(id_user);

-- 3. leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS id_user BIGINT;
-- Leads are harder to map to existing users, but we can try to map via landing_page_slug if possible.
UPDATE leads l 
SET id_user = lp.id_user 
FROM landing_pages lp 
WHERE l.landing_page_slug = lp.slug AND l.id_user IS NULL;

-- For leads with no slug or slug not found, default to user 1.
UPDATE leads SET id_user = 1 WHERE id_user IS NULL;
ALTER TABLE leads ALTER COLUMN id_user SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(id_user);

-- 4. landing_page_events
ALTER TABLE landing_page_events ADD COLUMN IF NOT EXISTS id_user BIGINT;
UPDATE landing_page_events e 
SET id_user = lp.id_user 
FROM landing_pages lp 
WHERE e.landing_page_slug = lp.slug AND e.id_user IS NULL;

UPDATE landing_page_events SET id_user = 1 WHERE id_user IS NULL;
ALTER TABLE landing_page_events ALTER COLUMN id_user SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_landing_page_events_user ON landing_page_events(id_user);
