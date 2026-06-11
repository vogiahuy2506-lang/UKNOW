-- Migration 056: Create missing tables for zalo_accounts and zalo_groups
-- These tables may not exist in all environments

BEGIN;

-- Create zalo_accounts table if it doesn't exist
CREATE TABLE IF NOT EXISTS zalo_accounts (
  id         BIGSERIAL PRIMARY KEY,
  id_user    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  status     VARCHAR(20) NOT NULL DEFAULT 'disconnected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zalo_accounts_user ON zalo_accounts(id_user);

-- Create zalo_groups table if it doesn't exist
CREATE TABLE IF NOT EXISTS zalo_groups (
  id               BIGSERIAL PRIMARY KEY,
  id_zalo_setting  BIGINT NOT NULL REFERENCES zalo_settings(id) ON DELETE CASCADE,
  group_id         VARCHAR(100) NOT NULL,
  group_name       VARCHAR(255),
  member_count     INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zalo_groups_setting ON zalo_groups(id_zalo_setting);

COMMIT;
