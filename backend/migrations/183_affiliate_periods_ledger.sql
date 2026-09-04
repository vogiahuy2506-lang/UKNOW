-- 183_affiliate_periods_ledger.sql
-- PR-A3: Đóng sổ tháng + ví hoa hồng đối tác affiliate

CREATE TABLE IF NOT EXISTS affiliate_periods (
  id                BIGSERIAL PRIMARY KEY,
  referrer_user_id  BIGINT        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  month_key         CHAR(7)       NOT NULL,
  gross_revenue     NUMERIC(12,2) NOT NULL,
  tier_level        SMALLINT      NOT NULL,
  rate_percent      SMALLINT      NOT NULL,
  commission_amount NUMERIC(12,2) NOT NULL,
  closed_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (referrer_user_id, month_key)
);

CREATE TABLE IF NOT EXISTS affiliate_ledger (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  entry_type  VARCHAR(20)   NOT NULL CHECK (entry_type IN ('commission','withdrawal','adjustment')),
  amount      NUMERIC(12,2) NOT NULL,
  ref_type    VARCHAR(20),
  ref_id      BIGINT,
  note        TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_ledger_user ON affiliate_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_periods_month ON affiliate_periods (month_key);
