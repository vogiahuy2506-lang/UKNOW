-- Migration: Fix node_type ENUM to include all AI-generated node types
-- The current ENUM 'node_type' only has: trigger, action, logic, data
-- We need to add: send_email, delay, zns, sms, etc.

-- Step 1: Change column to VARCHAR first to break the ENUM dependency
ALTER TABLE campaign_nodes 
    ALTER COLUMN node_type TYPE VARCHAR(50),
    ALTER COLUMN node_type SET DEFAULT 'action',
    ALTER COLUMN node_type SET NOT NULL;

-- Step 2: Drop old ENUM if it exists (only if no other columns use it)
DO $$ BEGIN
    -- Check if node_type enum has only 4 values (our old version)
    IF EXISTS (
        SELECT 1 FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid  
        WHERE t.typname = 'node_type'
        GROUP BY t.typname
        HAVING COUNT(*) = 4
    ) THEN
        -- Safe to drop - only used by our old column
        DROP TYPE IF EXISTS node_type;
    END IF;
EXCEPTION WHEN OTHERS THEN 
    -- If can't drop (e.g., other columns use it), just leave as VARCHAR
    RAISE NOTICE 'Could not drop node_type enum: %', SQLERRM;
END $$;

-- Step 3: Create new ENUM with all values
DO $$ BEGIN
    CREATE TYPE node_type AS ENUM (
        'trigger', 
        'action', 
        'logic', 
        'condition', 
        'send_email', 
        'send_zalo_personal', 
        'send_zalo_group', 
        'send_zalo_friend_request', 
        'delay', 
        'wait', 
        'end', 
        'zns', 
        'sms', 
        'data', 
        'filter', 
        'branch', 
        'split'
    );
EXCEPTION 
    WHEN duplicate_object THEN null; -- Already exists
END $$;

-- Step 4: Convert column to new ENUM
ALTER TABLE campaign_nodes 
    ALTER COLUMN node_type TYPE node_type USING node_type::node_type;

-- Also update campaign_node_runs if it exists
DO $$ 
BEGIN
    ALTER TABLE campaign_node_runs 
        ALTER COLUMN node_type TYPE VARCHAR(50);
    ALTER TABLE campaign_node_runs 
        ALTER COLUMN node_type TYPE node_type USING node_type::node_type;
EXCEPTION 
    WHEN undefined_column THEN null;
END $$;
