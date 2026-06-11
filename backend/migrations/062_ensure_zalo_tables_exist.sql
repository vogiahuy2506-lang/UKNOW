-- Migration 062: Ensure all required tables and columns exist for Zalo functionality
-- This migration ensures zalo_accounts and zalo_groups tables exist

BEGIN;

-- 1. Create zalo_accounts table if it doesn't exist
CREATE TABLE IF NOT EXISTS zalo_accounts (
  id         BIGSERIAL PRIMARY KEY,
  id_user    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  status     VARCHAR(20) NOT NULL DEFAULT 'disconnected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zalo_accounts_user ON zalo_accounts(id_user);

-- 2. Create zalo_groups table if it doesn't exist
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

-- 3. Create campaign_run_recipient_steps table if it doesn't exist
CREATE TABLE IF NOT EXISTS campaign_run_recipient_steps (
  id                 BIGSERIAL PRIMARY KEY,
  id_campaign_run     BIGINT REFERENCES campaign_runs(id) ON DELETE CASCADE,
  id_run             BIGINT REFERENCES campaign_runs(id) ON DELETE CASCADE,
  meta               JSONB NOT NULL DEFAULT '{}',
  is_fully_completed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for id_run only (id_campaign_run may not exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'campaign_run_recipient_steps' AND indexname = 'idx_crrs_run'
  ) THEN
    CREATE INDEX idx_crrs_run ON campaign_run_recipient_steps(id_run);
  END IF;
END $$;

-- 4. Create zalo_unreachable_phones table if it doesn't exist
CREATE TABLE IF NOT EXISTS zalo_unreachable_phones (
  id               BIGSERIAL PRIMARY KEY,
  id_user          BIGINT REFERENCES users(id) ON DELETE SET NULL,
  phone_normalized VARCHAR(20) NOT NULL,
  reason           TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zup_user ON zalo_unreachable_phones(id_user);

-- 5. Ensure zalo_messages has all required columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'zalo_messages' AND column_name = 'status'
  ) THEN
    ALTER TABLE zalo_messages ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'pending';
    RAISE NOTICE 'Added status column to zalo_messages';
  END IF;
END $$;

-- 6. Ensure campaign_run_recipient_steps has id_run column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaign_run_recipient_steps' AND column_name = 'id_run'
  ) THEN
    ALTER TABLE campaign_run_recipient_steps ADD COLUMN id_run BIGINT;
  END IF;
END $$;

-- 7. Fix campaign_status enum if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'campaign_status'
  ) THEN
    BEGIN
      ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'running';
      RAISE NOTICE 'Added running to campaign_status enum';
    EXCEPTION
      WHEN duplicate_object THEN
        RAISE NOTICE 'running already exists in campaign_status enum';
      WHEN OTHERS THEN
        RAISE NOTICE 'Could not modify campaign_status enum: %', SQLERRM;
    END;
  END IF;
END $$;

-- 8. Ensure landing_page_events.id_user allows NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'landing_page_events'
      AND column_name = 'id_user'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE landing_page_events ALTER COLUMN id_user DROP NOT NULL;
    RAISE NOTICE 'Dropped NOT NULL from landing_page_events.id_user';
  END IF;
END $$;

COMMIT;
