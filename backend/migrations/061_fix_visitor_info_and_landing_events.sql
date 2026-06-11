-- Migration 061: Fix corrupted visitor_info JSON data and landing_page_events
-- Issue 1: zalo_personal_conversations.visitor_info contains plain text instead of JSON
-- Issue 2: landing_page_events.id_user needs proper handling for NULL values

BEGIN;

-- Step 1: Safely cleanup corrupted visitor_info data
-- First, identify and reset invalid JSON values
DO $$
DECLARE
  rec RECORD;
  json_valid BOOLEAN;
BEGIN
  FOR rec IN
    SELECT id, visitor_info::text as vi_text
    FROM zalo_personal_conversations
    WHERE visitor_info IS NOT NULL AND visitor_info::text != ''
  LOOP
    BEGIN
      -- Try to validate if it's valid JSON
      json_valid := (rec.vi_text ~ '^\\s*\\{' AND rec.vi_text ~ '\\}\\s*$');
      
      IF NOT json_valid THEN
        -- Not valid JSON format, reset to empty object
        UPDATE zalo_personal_conversations
        SET visitor_info = '{}'::jsonb
        WHERE id = rec.id;
        RAISE NOTICE 'Reset invalid visitor_info for id %', rec.id;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        -- If any error occurs during JSON validation, reset to empty object
        UPDATE zalo_personal_conversations
        SET visitor_info = '{}'::jsonb
        WHERE id = rec.id;
        RAISE NOTICE 'Error processing id %, resetting visitor_info: %', rec.id, SQLERRM;
    END;
  END LOOP;
END $$;

-- Step 2: Fix personal chats with zalo_group source -> zalo_personal
UPDATE zalo_personal_conversations
SET visitor_info = COALESCE(
    NULLIF(visitor_info::text, '')::jsonb,
    '{}'::jsonb
) || '{"source":"zalo_personal"}'::jsonb
WHERE NOT (external_id LIKE 'group_%')
  AND visitor_info::text LIKE '%zalo_group%';

-- Step 3: Personal chats with is_group=true should be false
UPDATE zalo_personal_conversations
SET visitor_info = COALESCE(
    NULLIF(visitor_info::text, '')::jsonb,
    '{}'::jsonb
) || '{"is_group":false}'::jsonb
WHERE NOT (external_id LIKE 'group_%')
  AND visitor_info::text LIKE '%"is_group":true%';

-- Step 4: Group conversations (external_id LIKE 'group_%') should have is_group=true and source=zalo_group
UPDATE zalo_personal_conversations
SET visitor_info = COALESCE(
    NULLIF(visitor_info::text, '')::jsonb,
    '{}'::jsonb
) || '{"is_group":true,"source":"zalo_group"}'::jsonb
WHERE external_id LIKE 'group_%';

-- Step 5: Normalize visitor_name for group conversations
UPDATE zalo_personal_conversations
SET visitor_name = COALESCE(
    (NULLIF(visitor_info::text, '')::jsonb->>'group_name'),
    'Nhóm ' || (NULLIF(visitor_info::text, '')::jsonb->>'group_id')
)
WHERE external_id LIKE 'group_%'
  AND visitor_name LIKE '%(%)%';

-- Step 6: Fix landing_page_events - drop NOT NULL constraint temporarily and handle NULL values
-- First, check if id_user column has NOT NULL constraint and remove it
DO $$
BEGIN
  -- Check if column has NOT NULL constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'landing_page_events'
      AND column_name = 'id_user'
      AND is_nullable = 'NO'
  ) THEN
    -- Make column nullable
    ALTER TABLE landing_page_events ALTER COLUMN id_user DROP NOT NULL;
    RAISE NOTICE 'Dropped NOT NULL constraint from landing_page_events.id_user';
  END IF;
END $$;

-- Step 7: Update NULL id_user values with a default user (if needed for business logic)
-- This is optional - you may want to leave id_user NULL for anonymous events
-- For now, we'll leave them as NULL

COMMIT;
