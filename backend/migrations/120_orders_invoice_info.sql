-- 120: Buyer VAT invoice fields on paid orders (PR1 — form + amount; Mat Bao in 121+)

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS invoice_info JSONB;

COMMENT ON COLUMN orders.invoice_info IS
  'Optional VAT invoice request: wantInvoice, buyerType, buyer fields, vatRate/net/vatAmount/gross. Null when customer declined.';
