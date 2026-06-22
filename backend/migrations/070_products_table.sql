-- Migration: 070_products_table.sql
-- User-managed products table + migrate legacy JSON from business_profiles.products

BEGIN;

CREATE TABLE IF NOT EXISTS products (
  id              SERIAL PRIMARY KEY,
  id_user         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_code    VARCHAR(100),
  product_name    VARCHAR(255) NOT NULL,
  price           VARCHAR(100),
  original_price  VARCHAR(100),
  description     TEXT,
  usp             TEXT,
  category        VARCHAR(255),
  thumbnail_url   TEXT,
  status          VARCHAR(50) DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_id_user ON products(id_user);

-- Migrate legacy business_profiles.products JSON array (one-time per user without rows yet)
INSERT INTO products (id_user, product_name, price, description, usp, status)
SELECT
  bp.user_id,
  NULLIF(trim(elem->>'name'), ''),
  NULLIF(trim(elem->>'price'), ''),
  NULLIF(trim(elem->>'description'), ''),
  NULLIF(trim(elem->>'usp'), ''),
  'active'
FROM business_profiles bp
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN bp.products IS NULL OR trim(bp.products) = '' THEN '[]'::jsonb
    WHEN bp.products ~ '^\s*\[' THEN bp.products::jsonb
    ELSE '[]'::jsonb
  END
) AS elem
WHERE COALESCE(NULLIF(trim(elem->>'name'), ''), '') <> ''
  AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id_user = bp.user_id);

COMMIT;
