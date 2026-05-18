-- Migration: Add campaign node type enum values
-- Safe version: drop default trước khi đổi type, dùng ::text intermediate cast,
-- bọc mọi thứ trong exception handler để idempotent.

DO $$ BEGIN
    CREATE TYPE campaign_node_type AS ENUM (
        'trigger', 'action', 'logic', 'condition',
        'send_email', 'send_zalo_personal', 'send_zalo_group', 'send_zalo_friend_request',
        'delay', 'wait', 'end', 'zns', 'sms', 'data', 'filter', 'branch', 'split'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Phải drop default trước khi đổi type (PostgreSQL không tự cast default)
DO $$ BEGIN
    ALTER TABLE campaign_nodes ALTER COLUMN node_type DROP DEFAULT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE campaign_nodes
        ALTER COLUMN node_type TYPE campaign_node_type USING node_type::text::campaign_node_type;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'campaign_nodes.node_type type change skipped: %', SQLERRM;
END $$;

DO $$ BEGIN
    ALTER TABLE campaign_nodes ALTER COLUMN node_type SET DEFAULT 'action';
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE campaign_node_runs ALTER COLUMN node_type DROP DEFAULT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE campaign_node_runs
        ALTER COLUMN node_type TYPE campaign_node_type USING node_type::text::campaign_node_type;
EXCEPTION WHEN OTHERS THEN null; END $$;
