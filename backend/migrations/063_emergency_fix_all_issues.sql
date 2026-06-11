-- Migration 063: Emergency fix for multiple database issues
-- Fixes:
-- 1. Invalid visitor_info JSON (plain text instead of JSON object)
-- 2. Missing zalo_accounts table
-- 3. Missing campaign_id in customer_journey table
-- 4. Missing status in zalo_messages table
-- 5. Missing campaign_status 'running' enum value

BEGIN;

-- ============================================
-- PART 1: Fix invalid visitor_info in zalo_personal_conversations
-- The visitor_info column contains plain text like "Nhóm" instead of JSON
-- Cast to text first to avoid JSON parsing errors
-- ============================================

-- First, reset ALL visitor_info that is not valid JSON by checking text pattern
-- Use text casting to avoid JSON parsing errors
UPDATE zalo_personal_conversations
SET visitor_info = '{}'::jsonb
WHERE visitor_info IS NOT NULL
  AND visitor_info::text != ''
  AND visitor_info::text !~ '^\\{';

-- Now safe to ensure all remaining visitor_info values are valid JSON
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT id, visitor_info::text as vi_text
        FROM zalo_personal_conversations
        WHERE visitor_info IS NOT NULL
    LOOP
        BEGIN
            -- Try to cast to jsonb, if it fails, reset to empty object
            IF rec.vi_text::jsonb IS NULL THEN
                UPDATE zalo_personal_conversations SET visitor_info = '{}'::jsonb WHERE id = rec.id;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            UPDATE zalo_personal_conversations SET visitor_info = '{}'::jsonb WHERE id = rec.id;
        END;
    END LOOP;
END $$;

-- ============================================
-- PART 2: Create zalo_accounts table if missing
-- ============================================
CREATE TABLE IF NOT EXISTS zalo_accounts (
  id         BIGSERIAL PRIMARY KEY,
  id_user    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  status     VARCHAR(20) NOT NULL DEFAULT 'disconnected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zalo_accounts_user ON zalo_accounts(id_user);
CREATE INDEX IF NOT EXISTS idx_zalo_accounts_active ON zalo_accounts(id_user, is_active) WHERE is_active = TRUE;

-- ============================================
-- PART 3: Ensure customer_journey has campaign_id column
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_journey'
      AND column_name = 'campaign_id'
  ) THEN
    ALTER TABLE customer_journey ADD COLUMN campaign_id BIGINT REFERENCES campaigns(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added campaign_id column to customer_journey';
  END IF;
END $$;

-- Create index for campaign_id if column was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_journey'
      AND column_name = 'campaign_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_customer_journey_campaign ON customer_journey(campaign_id);
  END IF;
END $$;

-- ============================================
-- PART 4: Ensure zalo_messages has status column
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'zalo_messages'
      AND column_name = 'status'
  ) THEN
    ALTER TABLE zalo_messages ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'pending';
    RAISE NOTICE 'Added status column to zalo_messages';
  END IF;
END $$;

-- ============================================
-- PART 5: Fix campaign_status enum to include 'running'
-- ============================================
DO $$
BEGIN
  -- Check if enum exists and doesn't have 'running'
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'campaign_status'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumtypid = 'campaign_status'::regtype AND enumlabel = 'running'
  ) THEN
    ALTER TYPE campaign_status ADD VALUE 'running';
    RAISE NOTICE 'Added running to campaign_status enum';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'running already exists in campaign_status enum';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not modify campaign_status enum: %', SQLERRM;
END $$;

-- ============================================
-- PART 6: Now safe to apply the zalo group classification fixes
-- Use text casting to avoid JSON errors
-- ============================================

-- Step 1: Fix personal chats (external_id NOT starting with 'group_') with zalo_group source -> zalo_personal
UPDATE zalo_personal_conversations
SET visitor_info = COALESCE(
    NULLIF(visitor_info::text, '')::jsonb,
    '{}'::jsonb
) || '{"source":"zalo_personal"}'::jsonb
WHERE NOT (external_id LIKE 'group_%')
  AND visitor_info::text LIKE '%zalo_group%';

-- Step 2: Personal chats with is_group=true should be false
UPDATE zalo_personal_conversations
SET visitor_info = COALESCE(
    NULLIF(visitor_info::text, '')::jsonb,
    '{}'::jsonb
) || '{"is_group":false}'::jsonb
WHERE NOT (external_id LIKE 'group_%')
  AND visitor_info::text LIKE '%"is_group":true%';

-- Step 3: Group conversations (external_id LIKE 'group_%') should have is_group=true and source=zalo_group
UPDATE zalo_personal_conversations
SET visitor_info = COALESCE(
    NULLIF(visitor_info::text, '')::jsonb,
    '{}'::jsonb
) || '{"is_group":true,"source":"zalo_group"}'::jsonb
WHERE external_id LIKE 'group_%';

-- Step 4: Normalize visitor_name for group conversations
UPDATE zalo_personal_conversations
SET visitor_name = COALESCE(
    (NULLIF(visitor_info::text, '')::jsonb->>'group_name'),
    'Nhóm ' || (NULLIF(visitor_info::text, '')::jsonb->>'group_id')
)
WHERE external_id LIKE 'group_%'
  AND visitor_name LIKE '%(%)%';

COMMIT;
