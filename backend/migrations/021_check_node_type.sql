-- Check what type node_type actually is and fix any constraints

-- First, let's see what the column looks like
-- This query shows column details
SELECT 
    column_name, 
    data_type, 
    udt_name,
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'campaign_nodes' 
AND column_name = 'node_type';

-- Also check for any CHECK constraints on the table
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'campaign_nodes'::regclass;
