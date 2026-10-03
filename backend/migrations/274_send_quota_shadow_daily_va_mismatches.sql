-- 274: dau vet ben cua che do 'shadow' han muc gui (PLAN_SHADOW_HAN_MUC_GHI_CSDL_2026-10-03).
-- Bo dem lech truoc day chi nam trong RAM va console.warn nen mat moi lan deploy.
-- Chi them 2 bang do dac; khong khoa ngoai toi users (user bi xoa van phai con dau vet).

CREATE TABLE IF NOT EXISTS send_quota_shadow_daily (
  vn_day DATE NOT NULL,
  channel VARCHAR(20) NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  both_allowed INTEGER NOT NULL DEFAULT 0,
  both_denied INTEGER NOT NULL DEFAULT 0,
  legacy_allow_atomic_deny INTEGER NOT NULL DEFAULT 0,
  legacy_deny_atomic_allow INTEGER NOT NULL DEFAULT 0,
  atomic_candidate_error INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (vn_day, channel)
);

CREATE TABLE IF NOT EXISTS send_quota_shadow_mismatches (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vn_day DATE NOT NULL,
  channel VARCHAR(20) NOT NULL,
  user_id BIGINT,
  ctx_billing_user_id BIGINT,
  atomic_billing_user_id BIGINT,
  legacy_allowed BOOLEAN NOT NULL,
  atomic_allowed BOOLEAN NOT NULL,
  legacy_detail TEXT,
  atomic_diag JSONB,
  atomic_error TEXT,
  source_type VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_sqsm_created_at ON send_quota_shadow_mismatches (created_at);
