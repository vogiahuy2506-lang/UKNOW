-- Migration 060: Fix campaign_status enum to include 'running'
-- Issue: Production database has campaigns.status as an enum that doesn't include 'running'

BEGIN;

-- Add 'running' to campaign_status enum if the enum exists and doesn't have it
DO $$
BEGIN
  -- Check if the enum exists
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'campaign_status'
  ) THEN
    -- Check if 'running' already exists in the enum
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum WHERE enumtypid = 'campaign_status'::regtype AND enumlabel = 'running'
    ) THEN
      -- Add 'running' value using ALTER TYPE
      ALTER TYPE campaign_status ADD VALUE 'running';
      RAISE NOTICE 'Added running to campaign_status enum';
    ELSE
      RAISE NOTICE 'running already exists in campaign_status enum';
    END IF;
  ELSE
    RAISE NOTICE 'campaign_status enum does not exist - skipping';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'running already exists in campaign_status enum (caught by exception)';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not modify campaign_status enum: %', SQLERRM;
END $$;

COMMIT;
