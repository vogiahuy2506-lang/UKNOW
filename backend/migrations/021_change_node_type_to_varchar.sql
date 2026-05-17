-- Migration: Change campaign_nodes.node_type to VARCHAR to support AI-generated node types
-- This removes the ENUM constraint and allows any node_type value

-- If node_type is an ENUM type, drop it
DO $$ BEGIN
    DROP TYPE IF EXISTS campaign_node_type;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- Change node_type column to VARCHAR(50) if it has a constraint or is an ENUM
ALTER TABLE campaign_nodes 
    ALTER COLUMN node_type TYPE VARCHAR(50),
    ALTER COLUMN node_type SET DEFAULT 'action';

-- Also update campaign_node_runs table if node_type exists there
DO $$ 
BEGIN
    ALTER TABLE campaign_node_runs ALTER COLUMN node_type TYPE VARCHAR(50);
EXCEPTION
    WHEN undefined_column THEN null;
END $$;
