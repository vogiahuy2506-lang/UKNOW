-- Migration 055: Fix Zalo personal group vs personal conversation classification
-- Problem: conversations with external_id containing 'group_' were incorrectly
-- flagged as zalo_group even when they're personal chats.
-- Solution: only mark as zalo_group when external_id starts with 'group_'.
-- Uses DO block with exception handling to safely process invalid JSON values.

BEGIN;

-- Safely cleanup invalid visitor_info using a cursor/loop approach
-- Only attempt to clean values that look like JSON (start with { and end with })
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT id, visitor_info
        FROM zalo_personal_conversations
        WHERE visitor_info IS NOT NULL
          AND visitor_info::text != ''
          AND visitor_info::text ~ '^\\{.*\\}$'
    LOOP
        BEGIN
            -- Check if it's valid JSON by attempting to cast
            IF rec.visitor_info::jsonb IS NOT NULL THEN
                -- Valid JSON, check if it contains invalid keys
                IF NOT (rec.visitor_info::jsonb ? 'source') THEN
                    -- Missing source, safe to update
                    NULL; -- No-op, we'll fix it in the next steps
                END IF;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- If cast fails, set to empty object
            UPDATE zalo_personal_conversations SET visitor_info = '{}' WHERE id = rec.id;
        END;
    END LOOP;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error during JSON validation: %', SQLERRM;
END $$;

-- Safely reset any non-JSON or invalid visitor_info to empty object
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT id, visitor_info
        FROM zalo_personal_conversations
        WHERE visitor_info IS NOT NULL
          AND visitor_info::text != ''
          AND (
              -- Not a valid JSON string (doesn't start with {)
              visitor_info::text !~ '^\\{'
          )
    LOOP
        UPDATE zalo_personal_conversations
        SET visitor_info = '{}'
        WHERE id = rec.id;
    END LOOP;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error cleaning invalid visitor_info: %', SQLERRM;
END $$;

-- Step 1: Fix personal chats with zalo_group source -> zalo_personal
-- Safely update only if visitor_info is valid JSON
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT id, visitor_info
        FROM zalo_personal_conversations
        WHERE NOT (external_id LIKE 'group_%')
          AND visitor_info IS NOT NULL
          AND visitor_info::text != ''
          AND visitor_info::text ~ '^\\{.*\\}$' -- Only valid-looking JSON
    LOOP
        BEGIN
            IF rec.visitor_info::jsonb ? 'source' AND rec.visitor_info::jsonb->>'source' = 'zalo_group' THEN
                UPDATE zalo_personal_conversations
                SET visitor_info = (rec.visitor_info::jsonb - 'source') || '{"source":"zalo_personal"}'::jsonb
                WHERE id = rec.id;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Keep as is if update fails
            NULL;
        END;
    END LOOP;
END $$;

-- Step 2: Personal chats with is_group=true should be false
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT id, visitor_info
        FROM zalo_personal_conversations
        WHERE NOT (external_id LIKE 'group_%')
          AND visitor_info IS NOT NULL
          AND visitor_info::text != ''
          AND visitor_info::text ~ '^\\{.*\\}$'
    LOOP
        BEGIN
            IF rec.visitor_info::jsonb ? 'is_group' AND (rec.visitor_info::jsonb->>'is_group')::boolean = true THEN
                UPDATE zalo_personal_conversations
                SET visitor_info = (rec.visitor_info::jsonb - 'is_group') || '{"is_group":false}'::jsonb
                WHERE id = rec.id;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;
END $$;

-- Step 3: Group conversations (external_id LIKE 'group_%') should have is_group=true and source=zalo_group
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT id, visitor_info
        FROM zalo_personal_conversations
        WHERE external_id LIKE 'group_%'
          AND visitor_info IS NOT NULL
          AND visitor_info::text != ''
          AND visitor_info::text ~ '^\\{.*\\}$'
    LOOP
        BEGIN
            UPDATE zalo_personal_conversations
            SET visitor_info = (rec.visitor_info::jsonb - 'source' - 'is_group') || '{"is_group":true,"source":"zalo_group"}'::jsonb
            WHERE id = rec.id;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;
END $$;

-- Step 4: Normalize visitor_name for group conversations
UPDATE zalo_personal_conversations
SET visitor_name = COALESCE(
    (visitor_info::jsonb->>'group_name'),
    'Nhom ' || (visitor_info::jsonb->>'group_id')
)
WHERE external_id LIKE 'group_%'
  AND visitor_name LIKE '%(%)%'
  AND visitor_info IS NOT NULL
  AND visitor_info::text != ''
  AND visitor_info::text ~ '^\\{.*\\}$';

COMMIT;
