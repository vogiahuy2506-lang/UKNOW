-- Migration 178: Tao bang send_quota_reservations va lien ket quota_reservation_id
-- Thuoc Wave 2: Atomic Send Quota & Reservation Ledger

CREATE TABLE IF NOT EXISTS send_quota_reservations (
  id BIGSERIAL PRIMARY KEY,
  reservation_key VARCHAR(191) NOT NULL UNIQUE,
  request_fingerprint VARCHAR(64) NOT NULL,
  fingerprint_version VARCHAR(10) NOT NULL DEFAULT 'v1',
  billing_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  membership_id BIGINT REFERENCES user_members(id) ON DELETE SET NULL,
  channel VARCHAR(10) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  is_metered BOOLEAN NOT NULL DEFAULT true,
  wallet_item_key VARCHAR(50),
  wallet_quantity INTEGER NOT NULL DEFAULT 0 CHECK (wallet_quantity >= 0),
  source_type VARCHAR(50) NOT NULL,
  source_ref JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL,
  vn_day_start TIMESTAMPTZ NOT NULL,
  vn_day_end TIMESTAMPTZ NOT NULL,
  cycle_start TIMESTAMPTZ,
  cycle_end TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  provider_reference VARCHAR(255),
  failure_code VARCHAR(100),
  response_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sending_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  uncertain_at TIMESTAMPTZ,
  CONSTRAINT chk_sqr_channel CHECK (channel IN ('email', 'zalo')),
  CONSTRAINT chk_sqr_status CHECK (status IN ('reserved', 'sending', 'consumed', 'released', 'uncertain')),
  CONSTRAINT chk_sqr_wallet_quantity CHECK (wallet_quantity <= quantity),
  CONSTRAINT chk_sqr_fingerprint CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_sqr_wallet_item_key CHECK ((wallet_quantity > 0 AND wallet_item_key IN ('emails', 'zalo_messages')) OR (wallet_quantity = 0 AND wallet_item_key IS NULL)),
  CONSTRAINT chk_sqr_metered_wallet CHECK (is_metered = true OR wallet_quantity = 0),
  CONSTRAINT chk_sqr_response_snapshot_size CHECK (response_snapshot IS NULL OR octet_length(response_snapshot::text) <= 4096)
);

CREATE INDEX IF NOT EXISTS idx_sqr_billing_day
  ON send_quota_reservations (billing_user_id, status, vn_day_start, vn_day_end)
  WHERE is_metered = true;

CREATE INDEX IF NOT EXISTS idx_sqr_billing_cycle
  ON send_quota_reservations (billing_user_id, channel, status, cycle_start, cycle_end)
  WHERE is_metered = true;

CREATE INDEX IF NOT EXISTS idx_sqr_employee
  ON send_quota_reservations (billing_user_id, actor_user_id, channel, status, vn_day_start, vn_day_end)
  WHERE actor_user_id IS NOT NULL AND is_metered = true;

CREATE INDEX IF NOT EXISTS idx_sqr_sweeper
  ON send_quota_reservations (status, expires_at)
  WHERE status IN ('reserved', 'sending');

CREATE INDEX IF NOT EXISTS idx_sqr_wallet
  ON send_quota_reservations (billing_user_id, wallet_item_key, status)
  WHERE wallet_quantity > 0 AND status IN ('reserved', 'sending', 'uncertain');

ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS quota_reservation_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_em_quota_reservation_id
  ON email_messages (quota_reservation_id)
  WHERE quota_reservation_id IS NOT NULL;

ALTER TABLE zalo_messages ADD COLUMN IF NOT EXISTS quota_reservation_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_zm_quota_reservation_id
  ON zalo_messages (quota_reservation_id)
  WHERE quota_reservation_id IS NOT NULL;

ALTER TABLE zalo_personal_messages ADD COLUMN IF NOT EXISTS quota_reservation_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_zpm_quota_reservation_id
  ON zalo_personal_messages (quota_reservation_id)
  WHERE quota_reservation_id IS NOT NULL;

ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS quota_reservation_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ul_quota_reservation_id
  ON usage_logs (quota_reservation_id)
  WHERE quota_reservation_id IS NOT NULL;
