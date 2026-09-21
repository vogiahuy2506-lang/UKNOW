-- Payment accounts configuration (PR cho vietqr-chat-hero-landing)
-- Cho phép admin cấu hình nhiều tài khoản ngân hàng nhận thanh toán
-- (thanh toán / hoàn tiền / multiple accounts).
-- Nếu không có row active thì fallback về env var PAYMENT_BANK_* (xem service).

CREATE TABLE IF NOT EXISTS system_payment_accounts (
  id SERIAL PRIMARY KEY,
  is_active BOOLEAN NOT NULL DEFAULT true,
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  bank_bin TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_bank_bin_format CHECK (bank_bin ~ '^[0-9]{6}$'),
  CONSTRAINT chk_account_number_format CHECK (account_number ~ '^[0-9]{6,19}$')
);

-- Đảm bảo chỉ có 1 account is_default=true (Postgres partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_payment_accounts_default
  ON system_payment_accounts (is_default)
  WHERE is_default = true;

-- Index phổ biến: list các account active
CREATE INDEX IF NOT EXISTS idx_system_payment_accounts_active
  ON system_payment_accounts (is_active, is_default DESC);

COMMENT ON TABLE system_payment_accounts IS
  'Cấu hình tài khoản ngân hàng nhận thanh toán cho VietQR. Đọc qua service khi generate QR.';
