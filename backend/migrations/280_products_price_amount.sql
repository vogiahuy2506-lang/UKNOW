-- Migration 280: products.price_amount — gia dang SO (VND) cua san pham. Cot `price` la chuoi hien thi ("500k", "Lien he") nen
-- khong dung de tu dien so tien thanh toan cua bieu mau hay in cho chatbot. NULL = chua co so (khong doan).
-- CHECK dat ngay trong ADD COLUMN de chay lai khong loi.
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_amount BIGINT CONSTRAINT products_price_amount_check CHECK (price_amount IS NULL OR price_amount >= 0);
