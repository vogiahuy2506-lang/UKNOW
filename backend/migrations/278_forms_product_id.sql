-- Migration 278: forms.product_id — bieu mau ban / dang ky cho san pham nao (phieu theo san pham, PR-1).
ALTER TABLE forms ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_forms_product_id ON forms(product_id) WHERE product_id IS NOT NULL;
