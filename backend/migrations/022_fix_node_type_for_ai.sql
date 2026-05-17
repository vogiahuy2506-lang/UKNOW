-- Migration: Fix campaign_nodes node_type column to support all AI-generated node types
-- This removes any CHECK constraints and ensures node_type is VARCHAR

-- Drop the ENUM type if it exists
DO $$ BEGIN
    DROP TYPE IF EXISTS campaign_node_type;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Drop any CHECK constraints on node_type column
DO $$ 
DECLARE
    con_name TEXT;
BEGIN
    FOR con_name IN 
        SELECT conname FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid
        WHERE conrelid = 'campaign_nodes'::regclass
        AND a.attname = 'node_type'
        AND c.contype = 'c'
    LOOP
        EXECUTE 'ALTER TABLE campaign_nodes DROP CONSTRAINT IF EXISTS ' || con_name;
    END LOOP;
END $$;

-- Change node_type to VARCHAR(50) without any constraints
ALTER TABLE campaign_nodes 
    ALTER COLUMN node_type TYPE VARCHAR(50),
    ALTER COLUMN node_type SET DEFAULT 'action',
    ALTER COLUMN node_type SET NOT NULL;

-- Apply the same to campaign_node_runs if the column exists
DO $$ 
BEGIN
    -- Drop any CHECK constraints on campaign_node_runs.node_type
    FOR con_name IN 
        SELECT conname FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid
        WHERE conrelid = 'campaign_node_runs'::regclass
        AND a.attname = 'node_type'
        AND c.contype = 'c'
    LOOP
        EXECUTE 'ALTER TABLE campaign_node_runs DROP CONSTRAINT IF EXISTS ' || con_name;
    END LOOP;
    
    ALTER TABLE campaign_node_runs ALTER COLUMN node_type TYPE VARCHAR(50);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
