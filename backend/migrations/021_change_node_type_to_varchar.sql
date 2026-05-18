-- Migration: Change campaign_nodes.node_type to VARCHAR to support AI-generated node types

DO $$ BEGIN
    DROP TYPE IF EXISTS campaign_node_type;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE campaign_nodes ALTER COLUMN node_type DROP DEFAULT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE campaign_nodes
        ALTER COLUMN node_type TYPE VARCHAR(50) USING node_type::text,
        ALTER COLUMN node_type SET DEFAULT 'action';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'campaign_nodes.node_type varchar change skipped: %', SQLERRM;
END $$;

DO $$ BEGIN
    ALTER TABLE campaign_node_runs ALTER COLUMN node_type TYPE VARCHAR(50) USING node_type::text;
EXCEPTION WHEN OTHERS THEN null; END $$;
