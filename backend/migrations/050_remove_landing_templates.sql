-- Migration: Remove all default landing page templates
-- Keep the table structure but delete all seed data

-- Delete all existing templates
DELETE FROM landing_page_templates;

-- Reset the sequence for id
SELECT setval(pg_get_serial_sequence('landing_page_templates', 'id'), 1, false);
