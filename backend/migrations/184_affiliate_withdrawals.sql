CREATE TABLE affiliate_withdrawals (
  id                    BIGSERIAL PRIMARY KEY,
  user_id               BIGINT        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- Phân đôi giống invoice_profile. Quyết định thuế rẽ theo cột này.
  partner_type          VARCHAR(10)   NOT NULL DEFAULT 'personal'
    CHECK (partner_type IN ('personal', 'company')),

  amount_gross          NUMERIC(12,2) NOT NULL,
  tax_amount            NUMERIC(12,2) NOT NULL,   -- personal: 10% TNCN | company: 0
  amount_net            NUMERIC(12,2) NOT NULL,

  -- Dùng cho CẢ HAI loại
  full_name             VARCHAR(255)  NOT NULL,   -- personal: họ tên | company: người liên hệ
  tax_code              VARCHAR(20),              -- NULL được: xem ghi chú "vì sao nullable"
  bank_name             VARCHAR(255)  NOT NULL,
  bank_account_number   VARCHAR(50)   NOT NULL,
  bank_account_name     VARCHAR(255)  NOT NULL,

  -- Chỉ nhánh personal (chứng từ khấu trừ 10% TNCN cần)
  id_card_number_enc    TEXT,                     -- MÃ HOÁ, không lưu thô
  id_card_issued_date   DATE,
  id_card_issued_place  VARCHAR(255),

  -- Chỉ nhánh company (họ xuất hoá đơn cho Digiso, mình KHÔNG khấu trừ)
  company_name          VARCHAR(255),
  company_address       TEXT,
  invoice_reference     VARCHAR(100),             -- số hoá đơn kế toán đối chiếu

  status                VARCHAR(20)   NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','rejected')),
  requested_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  processed_at          TIMESTAMPTZ,
  processed_by          BIGINT REFERENCES users(id) ON DELETE SET NULL,
  note                  TEXT
);

CREATE INDEX idx_affiliate_withdrawals_user
  ON affiliate_withdrawals (user_id, requested_at DESC);
CREATE INDEX idx_affiliate_withdrawals_status
  ON affiliate_withdrawals (status, requested_at);
CREATE UNIQUE INDEX idx_affiliate_withdrawals_one_pending
  ON affiliate_withdrawals (user_id) WHERE status = 'pending';
