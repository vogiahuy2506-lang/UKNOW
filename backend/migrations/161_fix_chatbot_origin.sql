-- Migration 161: Ensure origin column exists and fix chatbot origins
-- This migration is idempotent - safe to run multiple times

-- Step 1: Add origin column if it doesn't exist (for databases that skipped migration 155)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_chatbots' AND column_name = 'origin'
  ) THEN
    ALTER TABLE custom_chatbots ADD COLUMN origin VARCHAR(50) DEFAULT 'self_created';
    RAISE NOTICE 'Added origin column to custom_chatbots';
  ELSE
    RAISE NOTICE 'origin column already exists';
  END IF;
END $$;

-- Step 2: Update chatbots with NULL origin to self_created
UPDATE custom_chatbots SET origin = 'self_created' WHERE origin IS NULL OR origin = '';

-- Step 3: Ensure chatbots created via marketplace purchase have correct origin
-- These should have origin = 'marketplace_purchased'
-- (Already handled by marketplace purchase service)

-- Step 4: Create index if not exists
CREATE INDEX IF NOT EXISTS idx_custom_chatbots_origin ON custom_chatbots(origin) WHERE is_active = true;

-- Step 5: Add NOT NULL constraint if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_chatbots' AND column_name = 'origin' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE custom_chatbots ALTER COLUMN origin SET DEFAULT 'self_created';
    ALTER TABLE custom_chatbots ALTER COLUMN origin SET NOT NULL;
    RAISE NOTICE 'Set origin as NOT NULL';
  END IF;
END $$;
