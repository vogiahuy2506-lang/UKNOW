-- Migration 279: products.kind — 'sale' (ban) | 'event' (su kien, buoi hop, tu van mien phi — khong phai luc nao cung ban).
-- DEFAULT 'sale' nen moi duong tao cu (AI, import) van dung; CHECK dat ngay trong ADD COLUMN de chay lai khong loi.
ALTER TABLE products ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'sale' CONSTRAINT products_kind_check CHECK (kind IN ('sale', 'event'));
