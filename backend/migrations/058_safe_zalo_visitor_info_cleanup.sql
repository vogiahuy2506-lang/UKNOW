-- Migration 058: Safely cleanup invalid visitor_info JSON data
-- Run this AFTER migration 055
-- This migration safely handles visitor_info that may contain plain text instead of valid JSON

BEGIN;

-- STEP 0: Pre-process - Reset ALL rows with invalid JSON to empty object first
-- Use a custom safe cast approach that doesn't throw errors

DO $$
DECLARE
    rec RECORD;
    clean_val TEXT;
BEGIN
    FOR rec IN
        SELECT id, visitor_info::text as vi_text
        FROM zalo_personal_conversations
        WHERE visitor_info IS NOT NULL
    LOOP
        clean_val := NULL;
        
        -- Check if it's valid JSON by trying to cast
        BEGIN
            -- If it's already valid JSONB, keep it
            clean_val := rec.vi_text::jsonb::text;
        EXCEPTION WHEN OTHERS THEN
            -- Not valid JSON, will reset to '{}'
            clean_val := NULL;
        END;
        
        -- If null or empty or invalid, reset
        IF clean_val IS NULL OR clean_val = '' OR clean_val = 'null' THEN
            UPDATE zalo_personal_conversations
            SET visitor_info = '{}'::jsonb
            WHERE id = rec.id;
        ELSE
            -- Ensure it's a valid JSON object (starts with { and ends with })
            IF clean_val NOT LIKE '{%' OR clean_val NOT LIKE '%}' THEN
                UPDATE zalo_personal_conversations
                SET visitor_info = '{}'::jsonb
                WHERE id = rec.id;
            END IF;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Migration 058: Pre-processed invalid visitor_info values';
END $$;

-- Now all visitor_info values are guaranteed to be valid JSON objects
-- STEP 1: Fix personal chats with zalo_group source -> zalo_personal
UPDATE zalo_personal_conversations
SET visitor_info = visitor_info || '{"source":"zalo_personal"}'::jsonb
WHERE NOT (external_id LIKE 'group_%')
  AND visitor_info ? 'source'
  AND visitor_info->>'source' = 'zalo_group';

-- STEP 2: Personal chats with is_group=true should be false
UPDATE zalo_personal_conversations
SET visitor_info = visitor_info - 'is_group' || '{"is_group":false}'::jsonb
WHERE NOT (external_id LIKE 'group_%')
  AND visitor_info ? 'is_group'
  AND visitor_info->>'is_group' = 'true';

-- STEP 3: Group conversations (external_id LIKE 'group_%') should have is_group=true and source=zalo_group
UPDATE zalo_personal_conversations
SET visitor_info = visitor_info - 'is_group' - 'source' || '{"is_group":true,"source":"zalo_group"}'::jsonb
WHERE external_id LIKE 'group_%';

-- STEP 4: Normalize visitor_name for group conversations
UPDATE zalo_personal_conversations
SET visitor_name = COALESCE(
    visitor_info->>'group_name',
    'Nhóm ' || (visitor_info->>'group_id')
)
WHERE external_id LIKE 'group_%'
  AND visitor_name LIKE '%(%)%';

COMMIT;
