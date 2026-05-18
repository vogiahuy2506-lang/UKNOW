-- Migration: Fix campaign_nodes node_type column to support all AI-generated node types

DO $$ BEGIN
    DROP TYPE IF EXISTS campaign_node_type;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Drop CHECK constraints on campaign_nodes.node_type
DO $$
DECLARE
    con_name TEXT;
BEGIN
    FOR con_name IN
        SELECT conname FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid
        WHERE c.conrelid = 'campaign_nodes'::regclass
          AND a.attname = 'node_type'
          AND c.contype = 'c'
    LOOP
        EXECUTE 'ALTER TABLE campaign_nodes DROP CONSTRAINT IF EXISTS ' || quote_ident(con_name);
    END LOOP;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE campaign_nodes ALTER COLUMN node_type DROP DEFAULT;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE campaign_nodes
        ALTER COLUMN node_type TYPE VARCHAR(50) USING node_type::text,
        ALTER COLUMN node_type SET DEFAULT 'action',
        ALTER COLUMN node_type SET NOT NULL;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '022: node_type alter skipped: %', SQLERRM;
END $$;

-- Drop CHECK constraints on campaign_node_runs.node_type (if table exists)
DO $$
DECLARE
    con_name TEXT;
BEGIN
    FOR con_name IN
        SELECT conname FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid
        WHERE c.conrelid = 'campaign_node_runs'::regclass
          AND a.attname = 'node_type'
          AND c.contype = 'c'
    LOOP
        EXECUTE 'ALTER TABLE campaign_node_runs DROP CONSTRAINT IF EXISTS ' || quote_ident(con_name);
    END LOOP;

    ALTER TABLE campaign_node_runs ALTER COLUMN node_type TYPE VARCHAR(50) USING node_type::text;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
