-- Migration 059: Fix missing columns in zalo_messages and campaign_run_recipient_steps
-- Issue: Production database is missing columns that the code expects
-- This migration should be run on databases that were created before these columns were added

BEGIN;

-- 1. Add status column to zalo_messages if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'zalo_messages' AND column_name = 'status'
  ) THEN
    ALTER TABLE zalo_messages ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'pending';
    RAISE NOTICE 'Added status column to zalo_messages';
  ELSE
    RAISE NOTICE 'status column already exists in zalo_messages';
  END IF;
END $$;

-- 2. Ensure campaign_run_recipient_steps has proper id_run column
-- The code expects id_run but production might have id_campaign_run
DO $$
BEGIN
  -- Check if id_run exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaign_run_recipient_steps' AND column_name = 'id_run'
  ) THEN
    -- Check if id_campaign_run exists (legacy name)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'campaign_run_recipient_steps' AND column_name = 'id_campaign_run'
    ) THEN
      -- Add id_run as a copy of id_campaign_run for backward compatibility
      ALTER TABLE campaign_run_recipient_steps ADD COLUMN id_run BIGINT;
      UPDATE campaign_run_recipient_steps SET id_run = id_campaign_run;
      ALTER TABLE campaign_run_recipient_steps ALTER COLUMN id_run SET NOT NULL;
      RAISE NOTICE 'Added id_run column as copy of id_campaign_run in campaign_run_recipient_steps';
    ELSE
      -- Add fresh id_run column
      ALTER TABLE campaign_run_recipient_steps ADD COLUMN id_run BIGINT;
      RAISE NOTICE 'Added id_run column to campaign_run_recipient_steps';
    END IF;
  ELSE
    RAISE NOTICE 'id_run column already exists in campaign_run_recipient_steps';
  END IF;
END $$;

-- 3. Add indexes for zalo_messages if they don't exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'zalo_messages' AND column_name = 'status'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_zalo_messages_status ON zalo_messages(status);
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'zalo_messages' AND column_name = 'channel'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_zalo_messages_channel ON zalo_messages(channel);
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'zalo_messages' AND column_name = 'created_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_zalo_messages_created ON zalo_messages(created_at);
  END IF;
END $$;

-- 4. Add foreign key and indexes for campaign_run_recipient_steps if id_run exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaign_run_recipient_steps' AND column_name = 'id_run'
  ) THEN
    -- Add foreign key constraint
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'campaign_run_recipient_steps' 
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'id_run'
    ) THEN
      ALTER TABLE campaign_run_recipient_steps 
        ADD CONSTRAINT fk_crrs_run 
        FOREIGN KEY (id_run) REFERENCES campaign_runs(id) ON DELETE CASCADE;
    END IF;
    
    CREATE INDEX IF NOT EXISTS idx_crrs_id_run ON campaign_run_recipient_steps(id_run);
  END IF;
END $$;

COMMIT;
