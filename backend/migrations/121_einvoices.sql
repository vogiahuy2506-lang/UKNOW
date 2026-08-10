-- 121: Electronic invoices issued via Mat Bao HDDT (one row per paid order)

CREATE TABLE IF NOT EXISTS einvoices (
  id               BIGSERIAL PRIMARY KEY,
  order_id         INTEGER      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ma_tra_cuu       VARCHAR(100) NOT NULL,
  mtchieu          VARCHAR(20)  NOT NULL,
  khmshdon         VARCHAR(20),
  khhdon           VARCHAR(20),
  ma_so_hdon       TEXT,
  so_hdon          VARCHAR(64),
  status           VARCHAR(32)  NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'issued', 'failed', 'cqt_ok', 'cqt_rejected')),
  cqt_code         VARCHAR(64),
  error_code       VARCHAR(64),
  error_message    TEXT,
  pdf_url          TEXT,
  request_payload  JSONB,
  response_payload JSONB,
  issued_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT einvoices_order_id_key UNIQUE (order_id),
  CONSTRAINT einvoices_ma_tra_cuu_key UNIQUE (ma_tra_cuu)
);

CREATE INDEX IF NOT EXISTS idx_einvoices_status_retry
  ON einvoices (status, error_code, updated_at);

COMMENT ON TABLE einvoices IS 'VAT e-invoices via Mat Bao; one per order; pdf_url only (no base64 in DB).';
