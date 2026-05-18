-- Migration: Ensure campaign_nodes.node_type is VARCHAR(50) — idempotent.
-- Các migration 021 trước đó có thể để column ở enum hoặc varchar tùy thứ tự chạy.
-- Mục tiêu cuối: VARCHAR(50) để hỗ trợ AI-generated node type strings tự do.

DO $$ BEGIN
    ALTER TABLE campaign_nodes ALTER COLUMN node_type DROP DEFAULT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE campaign_nodes
        ALTER COLUMN node_type TYPE VARCHAR(50) USING node_type::text,
        ALTER COLUMN node_type SET DEFAULT 'action',
        ALTER COLUMN node_type SET NOT NULL;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '025: campaign_nodes.node_type already VARCHAR or error: %', SQLERRM;
END $$;

-- Drop enum types không còn dùng nữa
DO $$ BEGIN
    DROP TYPE IF EXISTS campaign_node_type;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
    DROP TYPE IF EXISTS node_type;
EXCEPTION WHEN OTHERS THEN null; END $$;
