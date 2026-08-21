-- Migration 162: orders.paid_at — explicit fulfillment timestamp
--
-- orders.updated_at was being read as "thời gian thanh toán" on VAT invoices
-- (matbaoInvoice.service.js), but it means "last row update" — any future UPDATE
-- to the order (status fixups, admin edits) would silently corrupt a legal
-- invoice's printed payment time. paid_at is set once, in claimOrderSuccess,
-- and never touched again.
--
-- Declared TIMESTAMPTZ explicitly so it stores a correct absolute instant
-- regardless of what type orders.created_at/updated_at currently have.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

COMMENT ON COLUMN orders.paid_at IS
  'Set once when the order transitions to success (claimOrderSuccess). NULL for orders that never paid or predate this column — callers should fall back to updated_at for those.';
