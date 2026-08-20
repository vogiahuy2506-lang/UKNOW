-- Migration 149: Create scheduled_plan_changes table for deferred plan changes
CREATE TABLE IF NOT EXISTS scheduled_plan_changes (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id       BIGINT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  billing_period VARCHAR(10) NOT NULL CHECK (billing_period IN ('monthly','yearly')),
  order_id      BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  amount_paid   BIGINT NOT NULL DEFAULT 0,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','activated','superseded')),
  activate_after TIMESTAMPTZ NOT NULL,
  activated_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_plan_change_pending
  ON scheduled_plan_changes (user_id) WHERE status = 'pending';
