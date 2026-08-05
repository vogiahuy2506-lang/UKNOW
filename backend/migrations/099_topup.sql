-- 099: Mua lẻ hạn mức (top-up) giữa chu kỳ
-- Bảng giá riêng (không dùng custom_plan_pricing), grants + topup_config trên orders.

CREATE TABLE IF NOT EXISTS topup_pricing (
  id           BIGSERIAL PRIMARY KEY,
  item_key     VARCHAR(50) UNIQUE NOT NULL,
  unit_price   BIGINT  NOT NULL DEFAULT 0,
  min_qty      INTEGER NOT NULL DEFAULT 0,
  step_qty     INTEGER NOT NULL DEFAULT 1,
  max_qty      INTEGER,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT topup_pricing_unit_price_nonneg CHECK (unit_price >= 0),
  CONSTRAINT topup_pricing_min_qty_nonneg CHECK (min_qty >= 0),
  CONSTRAINT topup_pricing_step_qty_positive CHECK (step_qty > 0)
);

INSERT INTO topup_pricing (item_key, unit_price, min_qty, step_qty, max_qty, is_active, sort_order)
VALUES
  ('zalo_messages', 100, 50, 50, NULL, TRUE, 10),
  ('emails', 20, 250, 250, 50000, TRUE, 20),
  ('ai_credits', 200, 25, 25, 5000, TRUE, 30)
ON CONFLICT (item_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS topup_grants (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key   VARCHAR(50) NOT NULL,
  qty        INTEGER NOT NULL CHECK (qty > 0),
  order_id   BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  cycle_end  TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT topup_grants_order_item_unique UNIQUE (order_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_topup_grants_user_item_cycle
  ON topup_grants (user_id, item_key, cycle_end);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS topup_config JSONB;

COMMENT ON TABLE topup_pricing IS 'Đơn giá mua lẻ hạn mức (theo đơn vị, không theo khối).';
COMMENT ON TABLE topup_grants IS 'Hạn mức đã mua thêm; hiệu lực neo theo cycle_end = subscription_expires_at lúc cấp.';
COMMENT ON COLUMN orders.topup_config IS 'Payload đơn top-up (quantities, billingUserId, total). note = topup.';
