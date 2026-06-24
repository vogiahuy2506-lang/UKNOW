-- Migration: 072_products_add_fields.sql
-- Product CTA URL + target audience for AI/campaign context

BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS product_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS target_audience TEXT;

COMMIT;
