-- Migration 141: Lưu hồ sơ xuất hoá đơn người dùng tự lưu để điền sẵn
ALTER TABLE users ADD COLUMN IF NOT EXISTS invoice_profile JSONB;

COMMENT ON COLUMN users.invoice_profile IS
  'Hồ sơ xuất hoá đơn khách tự lưu để điền sẵn lần sau. KHÁC orders.invoice_info (ảnh chụp theo đơn, giữ vĩnh viễn cho kế toán).';
