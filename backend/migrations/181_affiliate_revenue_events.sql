-- 181_affiliate_revenue_events.sql
-- PR-A2: Ghi nhận doanh thu quy gán affiliate từ các đơn hàng thành công

CREATE TABLE IF NOT EXISTS affiliate_revenue_events (
  id                BIGSERIAL PRIMARY KEY,
  referrer_user_id  BIGINT        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  buyer_user_id     BIGINT        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_id          INTEGER       NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  amount            NUMERIC(12,2) NOT NULL,
  month_key         CHAR(7)       NOT NULL,            -- 'YYYY-MM', theo giờ VN
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_are_referrer_month ON affiliate_revenue_events (referrer_user_id, month_key);
CREATE INDEX IF NOT EXISTS idx_are_buyer_user_id  ON affiliate_revenue_events (buyer_user_id);
